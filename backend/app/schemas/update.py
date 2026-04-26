from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.ids import SafeId, SafeUpdateId
from app.schemas.source import GitMetadata

UpdateStatus = Literal["pending", "approved", "rejected"]


class ProposedChange(BaseModel):
    section: str
    old_text: str | None = None
    new_text: str = Field(min_length=1)


class CreateProposedUpdateRequest(BaseModel):
    playbook_id: SafeId
    target_rule_id: SafeId
    reason: str = Field(min_length=1)
    proposed_change: ProposedChange
    suggested_by: str = "business_user"


class CreateProposedUpdateResponse(BaseModel):
    update_id: SafeUpdateId
    status: UpdateStatus
    commit_hash: str | None = None


class DraftRuleUpdateRequest(BaseModel):
    playbook_id: SafeId
    target_rule_id: SafeId
    instruction: str = Field(min_length=1)


class DraftRuleUpdateResponse(BaseModel):
    section: str
    reason: str
    new_text: str


class ApplyRuleUpdateRequest(BaseModel):
    playbook_id: SafeId
    target_rule_id: SafeId
    reason: str = Field(min_length=1)
    proposed_change: ProposedChange
    approved_by: str = Field(min_length=1)


class ProposedUpdateSummary(BaseModel):
    update_id: SafeUpdateId
    playbook_id: SafeId
    target_rule_id: SafeId
    status: UpdateStatus
    reason: str
    proposed_change: ProposedChange
    suggested_by: str
    suggested_at: datetime
    git_metadata: GitMetadata | None = None


class ListProposedUpdatesResponse(BaseModel):
    updates: list[ProposedUpdateSummary]
    ai_overview: str | None = None


class ApproveUpdateRequest(BaseModel):
    approved_by: str = Field(min_length=1)


class RejectUpdateRequest(BaseModel):
    rejected_by: str = Field(min_length=1)
    reason: str = Field(min_length=1)


class UpdateDecisionResponse(BaseModel):
    update_id: SafeUpdateId
    status: UpdateStatus
    commit_hash: str | None = None
    reindexed: bool = False
