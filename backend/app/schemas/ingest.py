from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.playbook import RuleTemplate

IngestStatus = Literal["draft", "published"]
IngestSourceKind = Literal["playbook_source", "contract_set"]


class IngestDraftSummary(BaseModel):
    ingest_id: str
    playbook_id: str
    status: IngestStatus
    source_filenames: list[str]
    rule_count: int
    created_at: datetime
    source_kind: IngestSourceKind = "playbook_source"


class IngestDraftDetail(IngestDraftSummary):
    rules: list[RuleTemplate]


class IngestUploadResponse(IngestDraftDetail):
    pass


class ListIngestDraftsResponse(BaseModel):
    drafts: list[IngestDraftSummary]


class PublishIngestResponse(BaseModel):
    ingest_id: str
    playbook_id: str
    rules_published: int
    reindexed: bool
