from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.ids import SafeId
from app.schemas.source import SourceReference

TaskType = Literal["ask_playbook"]
ConfidenceLabel = Literal["low", "medium", "high"]
ConversationRole = Literal["user", "assistant"]


class ConversationMessage(BaseModel):
    role: ConversationRole
    text: str = Field(min_length=1)


class AskQuestionRequest(BaseModel):
    playbook_id: SafeId
    playbook_ids: list[SafeId] = Field(default_factory=list)
    task_type: TaskType = "ask_playbook"
    question: str = Field(min_length=1)
    conversation: list[ConversationMessage] = Field(default_factory=list, max_length=12)


class Confidence(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    label: ConfidenceLabel
    reason: str


class AskQuestionResponse(BaseModel):
    answer: str
    confidence: Confidence
    sources: list[SourceReference]


class GenerateChatTitleRequest(BaseModel):
    question: str = Field(min_length=1)


class GenerateChatTitleResponse(BaseModel):
    title: str
