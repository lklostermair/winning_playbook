from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.source import SourceDocument

RuleStatus = Literal["draft", "approved", "pending_update", "archived"]


class PlaybookSummary(BaseModel):
    playbook_id: str
    name: str
    description: str | None = None


class ListPlaybooksResponse(BaseModel):
    playbooks: list[PlaybookSummary]


class RuleSummary(BaseModel):
    rule_id: str
    topic: str
    status: RuleStatus


class PlaybookRulesResponse(BaseModel):
    playbook_id: str
    rules: list[RuleSummary]


class RuleTemplate(BaseModel):
    playbook_id: str
    rule_id: str
    topic: str
    standard_position: str | None = None
    fallback_positions: list[str] = Field(default_factory=list)
    red_line: str | None = None
    decision_logic: str | None = None
    escalation_logic: str | None = None
    rationale: str | None = None
    negotiation_tips: list[str] = Field(default_factory=list)
    suggested_language: str | None = None
    status: RuleStatus = "draft"
    source_documents: list[SourceDocument] = Field(default_factory=list)
