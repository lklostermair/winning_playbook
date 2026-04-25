from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, Field

from app.schemas.playbook import RuleTemplate
from app.schemas.update import (
    CreateProposedUpdateRequest,
    ProposedChange,
    ProposedUpdateSummary,
    UpdateStatus,
)
from app.services.vault_service import VaultService


class ProposedUpdateError(RuntimeError):
    pass


class ProposedUpdateNotFoundError(FileNotFoundError):
    pass


class ProposedUpdateRecord(BaseModel):
    update_id: str
    playbook_id: str
    target_rule_id: str
    status: UpdateStatus = "pending"
    reason: str
    proposed_change: ProposedChange
    suggested_by: str
    suggested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    decided_by: str | None = None
    decided_at: datetime | None = None
    decision_reason: str | None = None
    commit_hash: str | None = None


class ProposedUpdateService:
    def __init__(self, vault_service: VaultService) -> None:
        self.vault_service = vault_service

    def create_update(self, request: CreateProposedUpdateRequest) -> ProposedUpdateRecord:
        rule = self.vault_service.read_rule(request.playbook_id, request.target_rule_id)
        current_text = section_text(rule, request.proposed_change.section)
        if request.proposed_change.old_text is None:
            request.proposed_change.old_text = current_text
        elif normalize_text(request.proposed_change.old_text) != normalize_text(current_text):
            raise ProposedUpdateError("Proposed change old_text does not match the current rule section.")

        record = ProposedUpdateRecord(
            update_id=f"update_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:8]}",
            playbook_id=request.playbook_id,
            target_rule_id=request.target_rule_id,
            reason=request.reason,
            proposed_change=request.proposed_change,
            suggested_by=request.suggested_by,
        )
        self._write_record(record)
        return record

    def list_updates(self, playbook_id: str) -> list[ProposedUpdateSummary]:
        updates = []
        for path in sorted(self._updates_dir(playbook_id).glob("*.json")):
            updates.append(self._summary(self._read_record(path)))
        return updates

    def approve_update(self, update_id: str, approved_by: str) -> tuple[ProposedUpdateRecord, RuleTemplate]:
        record = self.get_update(update_id)
        if record.status != "pending":
            raise ProposedUpdateError(f"Update `{update_id}` is already {record.status}.")

        rule = self.vault_service.read_rule(record.playbook_id, record.target_rule_id)
        current_text = section_text(rule, record.proposed_change.section)
        expected_old_text = record.proposed_change.old_text
        if expected_old_text is not None and normalize_text(expected_old_text) != normalize_text(current_text):
            raise ProposedUpdateError("The target rule section changed since this update was proposed.")

        apply_section_change(rule, record.proposed_change.section, record.proposed_change.new_text)
        rule.status = "approved"
        self.vault_service.update_rule(rule)

        record.status = "approved"
        record.decided_by = approved_by
        record.decided_at = datetime.now(timezone.utc)
        self._write_record(record)
        return record, rule

    def reject_update(self, update_id: str, rejected_by: str, reason: str) -> ProposedUpdateRecord:
        record = self.get_update(update_id)
        if record.status != "pending":
            raise ProposedUpdateError(f"Update `{update_id}` is already {record.status}.")
        record.status = "rejected"
        record.decided_by = rejected_by
        record.decided_at = datetime.now(timezone.utc)
        record.decision_reason = reason
        self._write_record(record)
        return record

    def get_update(self, update_id: str) -> ProposedUpdateRecord:
        matches = sorted(self.vault_service.vault_dir.glob(f"*/proposed_updates/{update_id}.json"))
        if not matches:
            raise ProposedUpdateNotFoundError(f"Proposed update `{update_id}` was not found.")
        if len(matches) > 1:
            raise ProposedUpdateError(f"Proposed update id `{update_id}` is not unique.")
        return self._read_record(matches[0])

    def update_paths(self, record: ProposedUpdateRecord) -> list[Path]:
        return [self._json_path(record), self._markdown_path(record)]

    def _updates_dir(self, playbook_id: str) -> Path:
        path = self.vault_service.proposed_updates_dir(playbook_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _json_path(self, record: ProposedUpdateRecord) -> Path:
        return self._updates_dir(record.playbook_id) / f"{record.update_id}.json"

    def _markdown_path(self, record: ProposedUpdateRecord) -> Path:
        return self._updates_dir(record.playbook_id) / f"{record.update_id}.md"

    def _write_record(self, record: ProposedUpdateRecord) -> None:
        self.vault_service._write_json(self._json_path(record), record.model_dump(mode="json"))
        self._markdown_path(record).write_text(render_proposed_update_markdown(record), encoding="utf-8")

    @staticmethod
    def _read_record(path: Path) -> ProposedUpdateRecord:
        return ProposedUpdateRecord.model_validate_json(path.read_text(encoding="utf-8"))

    @staticmethod
    def _summary(record: ProposedUpdateRecord) -> ProposedUpdateSummary:
        return ProposedUpdateSummary(
            update_id=record.update_id,
            playbook_id=record.playbook_id,
            target_rule_id=record.target_rule_id,
            status=record.status,
            reason=record.reason,
            proposed_change=record.proposed_change,
            suggested_by=record.suggested_by,
            suggested_at=record.suggested_at,
        )


def apply_section_change(rule: RuleTemplate, section: str, new_text: str) -> None:
    normalized = normalize_section(section)
    if normalized == "standard_position":
        rule.standard_position = new_text
    elif normalized == "fallback_position":
        rule.fallback_positions = markdown_list_to_values(new_text)
    elif normalized == "red_line":
        rule.red_line = new_text
    elif normalized == "decision_logic":
        rule.decision_logic = new_text
    elif normalized == "escalation_logic":
        rule.escalation_logic = new_text
    elif normalized == "rationale":
        rule.rationale = new_text
    elif normalized == "negotiation_tips":
        rule.negotiation_tips = markdown_list_to_values(new_text)
    elif normalized == "suggested_language":
        rule.suggested_language = new_text
    else:
        raise ProposedUpdateError(f"Unsupported rule section: {section}")


def section_text(rule: RuleTemplate, section: str) -> str:
    normalized = normalize_section(section)
    if normalized == "standard_position":
        return rule.standard_position or ""
    if normalized == "fallback_position":
        return values_to_markdown_list(rule.fallback_positions)
    if normalized == "red_line":
        return rule.red_line or ""
    if normalized == "decision_logic":
        return rule.decision_logic or ""
    if normalized == "escalation_logic":
        return rule.escalation_logic or ""
    if normalized == "rationale":
        return rule.rationale or ""
    if normalized == "negotiation_tips":
        return values_to_markdown_list(rule.negotiation_tips)
    if normalized == "suggested_language":
        return rule.suggested_language or ""
    raise ProposedUpdateError(f"Unsupported rule section: {section}")


def normalize_section(section: str) -> str:
    return section.strip().lower().replace(" ", "_").replace("-", "_")


def normalize_text(text: str) -> str:
    return "\n".join(line.strip() for line in text.strip().splitlines())


def values_to_markdown_list(values: list[str]) -> str:
    return "\n".join(f"- {value}" for value in values)


def markdown_list_to_values(text: str) -> list[str]:
    values = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        values.append(stripped[2:].strip() if stripped.startswith("- ") else stripped)
    return values


def render_proposed_update_markdown(record: ProposedUpdateRecord) -> str:
    change = record.proposed_change
    lines = [
        f"# Proposed Update {record.update_id}",
        "",
        "## Target",
        f"- Playbook: {record.playbook_id}",
        f"- Rule: {record.target_rule_id}",
        f"- Section: {change.section}",
        f"- Status: {record.status}",
        "",
        "## Reason",
        record.reason,
        "",
        "## Old Text",
        change.old_text or "_Not specified._",
        "",
        "## New Text",
        change.new_text,
        "",
        "## Audit",
        f"- Suggested by: {record.suggested_by}",
        f"- Suggested at: {record.suggested_at.isoformat()}",
    ]
    if record.decided_by:
        lines.extend(
            [
                f"- Decided by: {record.decided_by}",
                f"- Decided at: {record.decided_at.isoformat() if record.decided_at else '_Not specified._'}",
            ]
        )
    if record.decision_reason:
        lines.append(f"- Decision reason: {record.decision_reason}")
    if record.commit_hash:
        lines.append(f"- Commit: {record.commit_hash}")
    lines.append("")
    return "\n".join(lines)
