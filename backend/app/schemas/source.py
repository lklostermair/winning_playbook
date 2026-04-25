from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.ids import SafeId


class GitMetadata(BaseModel):
    last_changed_by: str
    last_changed_at: datetime
    last_commit_hash: str
    last_commit_message: str


class SourceDocument(BaseModel):
    filename: str
    location: str


class SourceReference(BaseModel):
    playbook_id: SafeId
    rule_id: SafeId
    file: str
    section: str
    snippet: str
    retrieval_score: float = Field(ge=0.0, le=1.0)
    git_metadata: GitMetadata
