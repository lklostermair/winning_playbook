from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.source import SourceReference

TaskType = Literal["ask_playbook"]
ConfidenceLabel = Literal["low", "medium", "high"]


class AskQuestionRequest(BaseModel):
    playbook_id: str
    task_type: TaskType = "ask_playbook"
    question: str = Field(min_length=1)


class Confidence(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    label: ConfidenceLabel
    reason: str


class AskQuestionResponse(BaseModel):
    answer: str
    confidence: Confidence
    sources: list[SourceReference]
