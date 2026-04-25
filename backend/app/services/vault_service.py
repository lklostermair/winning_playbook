import json
import re
from pathlib import Path

from app.schemas.playbook import PlaybookSummary, RuleSummary, RuleTemplate
from app.schemas.source import SourceDocument


class RuleNotFoundError(FileNotFoundError):
    pass


class VaultService:
    def __init__(self, vault_dir: Path) -> None:
        self.vault_dir = vault_dir

    def playbook_dir(self, playbook_id: str) -> Path:
        return self.vault_dir / playbook_id

    def rules_dir(self, playbook_id: str) -> Path:
        return self.playbook_dir(playbook_id) / "rules"

    def metadata_dir(self, playbook_id: str) -> Path:
        return self.playbook_dir(playbook_id) / "metadata"

    def rule_metadata_dir(self, playbook_id: str) -> Path:
        return self.metadata_dir(playbook_id) / "rules"

    def proposed_updates_dir(self, playbook_id: str) -> Path:
        return self.playbook_dir(playbook_id) / "proposed_updates"

    def playbook_manifest_path(self, playbook_id: str) -> Path:
        return self.metadata_dir(playbook_id) / "playbook.json"

    def rule_markdown_path(self, playbook_id: str, rule_id: str) -> Path:
        return self.rules_dir(playbook_id) / f"{rule_id}.md"

    def rule_json_path(self, playbook_id: str, rule_id: str) -> Path:
        return self.rule_metadata_dir(playbook_id) / f"{rule_id}.json"

    def ensure_playbook(self, playbook: PlaybookSummary) -> None:
        self.rules_dir(playbook.playbook_id).mkdir(parents=True, exist_ok=True)
        self.rule_metadata_dir(playbook.playbook_id).mkdir(parents=True, exist_ok=True)
        self.proposed_updates_dir(playbook.playbook_id).mkdir(parents=True, exist_ok=True)
        manifest_path = self.playbook_manifest_path(playbook.playbook_id)
        if not manifest_path.exists():
            self._write_json(manifest_path, playbook.model_dump(mode="json"))

    def list_playbooks(self) -> list[PlaybookSummary]:
        playbooks: list[PlaybookSummary] = []
        if not self.vault_dir.exists():
            return playbooks
        for child in sorted(self.vault_dir.iterdir()):
            if not child.is_dir():
                continue
            manifest_path = self.playbook_manifest_path(child.name)
            if manifest_path.exists():
                playbooks.append(PlaybookSummary.model_validate(self._read_json(manifest_path)))
            elif self.rules_dir(child.name).exists():
                playbooks.append(PlaybookSummary(playbook_id=child.name, name=child.name.upper()))
        return playbooks

    def list_rules(self, playbook_id: str) -> list[RuleSummary]:
        rules: list[RuleSummary] = []
        for path in sorted(self.rule_metadata_dir(playbook_id).glob("*.json")):
            rule = RuleTemplate.model_validate(self._read_json(path))
            rules.append(RuleSummary(rule_id=rule.rule_id, topic=rule.topic, status=rule.status))
        return rules

    def read_rule(self, playbook_id: str, rule_id: str) -> RuleTemplate:
        path = self.rule_json_path(playbook_id, rule_id)
        if not path.exists():
            raise RuleNotFoundError(f"Rule `{playbook_id}/{rule_id}` was not found")
        return RuleTemplate.model_validate(self._read_json(path))

    def read_rule_markdown(self, playbook_id: str, rule_id: str) -> str:
        path = self.rule_markdown_path(playbook_id, rule_id)
        if not path.exists():
            raise RuleNotFoundError(f"Rule Markdown `{playbook_id}/{rule_id}` was not found")
        return path.read_text(encoding="utf-8")

    def write_rule(self, rule: RuleTemplate) -> None:
        playbook = PlaybookSummary(
            playbook_id=rule.playbook_id,
            name=f"{rule.playbook_id.upper()} Playbook",
        )
        self.ensure_playbook(playbook)
        self._write_json(self.rule_json_path(rule.playbook_id, rule.rule_id), rule.model_dump(mode="json"))
        self.rule_markdown_path(rule.playbook_id, rule.rule_id).write_text(
            self.render_rule_markdown(rule),
            encoding="utf-8",
        )

    def update_rule(self, rule: RuleTemplate) -> None:
        if not self.rule_json_path(rule.playbook_id, rule.rule_id).exists():
            raise RuleNotFoundError(f"Rule `{rule.playbook_id}/{rule.rule_id}` was not found")
        self.write_rule(rule)

    def render_rule_markdown(self, rule: RuleTemplate) -> str:
        sections = [
            f"# {rule.topic}",
            "",
            "## Standard Position",
            self._text_or_placeholder(rule.standard_position),
            "",
            "## Fallback Position",
            self._markdown_list(rule.fallback_positions),
            "",
            "## Red Line",
            self._text_or_placeholder(rule.red_line),
            "",
            "## Decision Logic",
            self._text_or_placeholder(rule.decision_logic),
            "",
            "## Escalation Logic",
            self._text_or_placeholder(rule.escalation_logic),
            "",
            "## Rationale",
            self._text_or_placeholder(rule.rationale),
            "",
            "## Negotiation Tips",
            self._markdown_list(rule.negotiation_tips),
            "",
            "## Suggested Language",
            self._text_or_placeholder(rule.suggested_language),
            "",
            "## Metadata",
            f"- Playbook: {rule.playbook_id}",
            f"- Rule ID: {rule.rule_id}",
            f"- Status: {rule.status}",
            "- Source Documents:",
            *self._source_document_lines(rule.source_documents),
            "",
        ]
        return "\n".join(sections)

    @staticmethod
    def slugify_topic(topic: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-")
        return slug or "untitled-rule"

    @staticmethod
    def _text_or_placeholder(value: str | None) -> str:
        return value if value else "_Not specified._"

    @staticmethod
    def _markdown_list(values: list[str]) -> str:
        if not values:
            return "_Not specified._"
        return "\n".join(f"- {value}" for value in values)

    @staticmethod
    def _source_document_lines(source_documents: list[SourceDocument]) -> list[str]:
        if not source_documents:
            return ["  - _Not specified._"]
        return [f"  - {source.filename} ({source.location})" for source in source_documents]

    @staticmethod
    def _read_json(path: Path) -> dict:
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _write_json(path: Path, payload: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
