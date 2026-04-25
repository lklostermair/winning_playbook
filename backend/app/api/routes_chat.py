from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.schemas.chat import AskQuestionRequest, AskQuestionResponse, Confidence
from app.schemas.source import SourceReference
from app.services.git_service import GitService, GitServiceError

router = APIRouter(tags=["chat"])


def _stub_source() -> SourceReference:
    source_file = get_settings().vault_dir / "nda" / "rules" / "other-liabilities-indemnification-limitation-of-liability.md"
    try:
        git_metadata = GitService().get_last_change_metadata(source_file)
    except GitServiceError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return SourceReference(
        file=str(source_file),
        section="Red Line",
        snippet="Stub source: unlimited or uncapped liability must be escalated before acceptance.",
        retrieval_score=0.86,
        git_metadata=git_metadata,
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
