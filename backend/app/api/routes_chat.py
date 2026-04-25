from datetime import datetime, timezone

from fastapi import APIRouter

from app.schemas.chat import AskQuestionRequest, AskQuestionResponse, Confidence
from app.schemas.source import GitMetadata, SourceReference

router = APIRouter(tags=["chat"])


def _stub_git_metadata() -> GitMetadata:
    return GitMetadata(
        last_changed_by="system",
        last_changed_at=datetime(2026, 4, 25, 12, 0, tzinfo=timezone.utc),
        last_commit_hash="stub-uncommitted",
        last_commit_message="WP1 stub API contract",
    )


def _stub_source() -> SourceReference:
    return SourceReference(
        file="vault/nda/rules/liability-for-correctness.md",
        section="Red Line",
        snippet="Stub source: unlimited or uncapped liability must be escalated before acceptance.",
        retrieval_score=0.86,
        git_metadata=_stub_git_metadata(),
    )


@router.post("/ask", response_model=AskQuestionResponse)
async def ask_playbook(request: AskQuestionRequest) -> AskQuestionResponse:
    return AskQuestionResponse(
        answer=(
            "Stub answer: based on the NDA playbook contract, unlimited liability should "
            "not be accepted without legal escalation. WP5/WP6 will replace this with "
            "retrieval-grounded generation."
        ),
        confidence=Confidence(
            score=0.82,
            label="high",
            reason=(
                "Stub confidence: the placeholder source directly addresses the requested "
                f"playbook `{request.playbook_id}`."
            ),
        ),
        sources=[_stub_source()],
    )
