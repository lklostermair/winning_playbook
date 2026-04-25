from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

UpdateStatus = Literal["pending", "approved", "rejected"]


class ProposedChange(BaseModel):
    section: str
    old_text: str | None = None
    new_text: str = Field(min_length=1)


class CreateProposedUpdateRequest(BaseModel):
    playbook_id: str
    target_rule_id: str
    reason: str = Field(min_length=1)
    proposed_change: ProposedChange
    suggested_by: str = "business_user"


class CreateProposedUpdateResponse(BaseModel):
    update_id: str
    status: UpdateStatus


class ProposedUpdateSummary(BaseModel):
    update_id: str
    playbook_id: str
    target_rule_id: str
    status: UpdateStatus
    reason: str
    proposed_change: ProposedChange
    suggested_by: str
    suggested_at: datetime


class ListProposedUpdatesResponse(BaseModel):
    updates: list[ProposedUpdateSummary]


class ApproveUpdateRequest(BaseModel):
    approved_by: str = Field(min_length=1)


class RejectUpdateRequest(BaseModel):
    rejected_by: str = Field(min_length=1)
    reason: str = Field(min_length=1)


class UpdateDecisionResponse(BaseModel):
    update_id: str
    status: UpdateStatus
    commit_hash: str | None = None
    reindexed: bool = False
