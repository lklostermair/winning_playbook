from datetime import datetime, timezone

from fastapi import APIRouter

from app.schemas.update import (
    ApproveUpdateRequest,
    CreateProposedUpdateRequest,
    CreateProposedUpdateResponse,
    ListProposedUpdatesResponse,
    ProposedChange,
    ProposedUpdateSummary,
    RejectUpdateRequest,
    UpdateDecisionResponse,
)

router = APIRouter(tags=["updates"])


@router.post("/updates", response_model=CreateProposedUpdateResponse)
async def create_update(request: CreateProposedUpdateRequest) -> CreateProposedUpdateResponse:
    return CreateProposedUpdateResponse(update_id="update_001", status="pending")


@router.get("/updates", response_model=ListProposedUpdatesResponse)
async def list_updates(playbook_id: str = "nda") -> ListProposedUpdatesResponse:
    return ListProposedUpdatesResponse(
        updates=[
            ProposedUpdateSummary(
                update_id="update_001",
                playbook_id=playbook_id,
                target_rule_id="liability-for-correctness",
                status="pending",
                reason="Stub proposed update for frontend contract development.",
                proposed_change=ProposedChange(
                    section="Fallback Position",
                    old_text=None,
                    new_text="Stub update: allow a defined fallback only after legal approval.",
                ),
                suggested_by="business_user",
                suggested_at=datetime(2026, 4, 25, 12, 30, tzinfo=timezone.utc),
            )
        ]
    )


@router.post("/updates/{update_id}/approve", response_model=UpdateDecisionResponse)
async def approve_update(
    update_id: str,
    request: ApproveUpdateRequest,
) -> UpdateDecisionResponse:
    return UpdateDecisionResponse(
        update_id=update_id,
        status="approved",
        commit_hash="stub-approved-commit",
        reindexed=True,
    )


@router.post("/updates/{update_id}/reject", response_model=UpdateDecisionResponse)
async def reject_update(
    update_id: str,
    request: RejectUpdateRequest,
) -> UpdateDecisionResponse:
    return UpdateDecisionResponse(
        update_id=update_id,
        status="rejected",
        commit_hash=None,
        reindexed=False,
    )
