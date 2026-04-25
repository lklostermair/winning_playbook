import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.schemas.ingest import IngestDraftDetail, IngestDraftSummary
from app.schemas.playbook import PlaybookSummary, RuleTemplate
from app.services.playbook_extraction_service import ExtractionMode, PlaybookExtractionService
from app.services.vault_service import VaultService


class IngestError(RuntimeError):
    pass


class IngestNotFoundError(FileNotFoundError):
    pass


class IngestService:
    def __init__(self, vault_service: VaultService, data_dir: Path) -> None:
        self.vault_service = vault_service
        self.data_dir = data_dir

    def create_draft(
        self,
        *,
        playbook_id: str,
        playbook_name: str,
        source_paths: list[Path],
        mode: ExtractionMode,
        extractor: PlaybookExtractionService,
    ) -> IngestDraftDetail:
        if not source_paths:
            raise IngestError("At least one source file is required.")

        ingest_id = f"ingest_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:8]}"
        draft_dir = self.draft_dir(playbook_id, ingest_id)
        sources_dir = draft_dir / "sources"
        sources_dir.mkdir(parents=True, exist_ok=True)

        copied_sources = []
        for source_path in source_paths:
            target = sources_dir / source_path.name
            shutil.copy2(source_path, target)
            copied_sources.append(target)

        rules = extractor.extract_rules(copied_sources)
        if not rules:
            raise IngestError("No playbook rules were extracted from the provided sources.")

        created_at = datetime.now(timezone.utc)
        self._write_json(
            draft_dir / "manifest.json",
            {
                "ingest_id": ingest_id,
                "playbook_id": playbook_id,
                "playbook_name": playbook_name,
                "status": "draft",
                "source_filenames": [path.name for path in copied_sources],
                "rule_count": len(rules),
                "created_at": created_at.isoformat(),
                "mode": mode,
            },
        )
        rules_dir = draft_dir / "rules"
        rules_dir.mkdir(parents=True, exist_ok=True)
        for rule in rules:
            self._write_json(rules_dir / f"{rule.rule_id}.json", rule.model_dump(mode="json"))
            (rules_dir / f"{rule.rule_id}.md").write_text(self.vault_service.render_rule_markdown(rule), encoding="utf-8")

        return self.get_draft(playbook_id, ingest_id)

    def list_drafts(self, playbook_id: str) -> list[IngestDraftSummary]:
        drafts = []
        base_dir = self.playbook_drafts_dir(playbook_id)
        if not base_dir.exists():
            return drafts
        for manifest_path in sorted(base_dir.glob("*/manifest.json"), reverse=True):
            drafts.append(self._summary_from_manifest(self._read_json(manifest_path)))
        return drafts

    def get_draft(self, playbook_id: str, ingest_id: str) -> IngestDraftDetail:
        draft_dir = self.draft_dir(playbook_id, ingest_id)
        manifest_path = draft_dir / "manifest.json"
        if not manifest_path.exists():
            raise IngestNotFoundError(f"Ingest draft `{playbook_id}/{ingest_id}` was not found.")
        manifest = self._read_json(manifest_path)
        rules = [
            RuleTemplate.model_validate(self._read_json(path))
            for path in sorted((draft_dir / "rules").glob("*.json"))
        ]
        return IngestDraftDetail(**self._summary_from_manifest(manifest).model_dump(), rules=rules)

    def publish_draft(self, playbook_id: str, ingest_id: str) -> int:
        draft = self.get_draft(playbook_id, ingest_id)
        self.vault_service.write_playbook_manifest(
            PlaybookSummary(
                playbook_id=playbook_id,
                name=f"{playbook_id.upper()} Playbook",
                description=f"Published from ingest draft {ingest_id}.",
            )
        )
        self.vault_service.clear_rules(playbook_id)
        for rule in draft.rules:
            rule.status = "approved"
            self.vault_service.write_rule(rule)
        manifest_path = self.draft_dir(playbook_id, ingest_id) / "manifest.json"
        manifest = self._read_json(manifest_path)
        manifest["status"] = "published"
        self._write_json(manifest_path, manifest)
        return len(draft.rules)

    def playbook_drafts_dir(self, playbook_id: str) -> Path:
        return self.vault_service.playbook_dir(playbook_id) / "draft_ingest"

    def draft_dir(self, playbook_id: str, ingest_id: str) -> Path:
        return self.playbook_drafts_dir(playbook_id) / ingest_id

    @staticmethod
    def _summary_from_manifest(manifest: dict) -> IngestDraftSummary:
        return IngestDraftSummary(
            ingest_id=str(manifest["ingest_id"]),
            playbook_id=str(manifest["playbook_id"]),
            status=manifest["status"],
            source_filenames=list(manifest["source_filenames"]),
            rule_count=int(manifest["rule_count"]),
            created_at=datetime.fromisoformat(manifest["created_at"]),
        )

    @staticmethod
    def _read_json(path: Path) -> dict:
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _write_json(path: Path, payload: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
