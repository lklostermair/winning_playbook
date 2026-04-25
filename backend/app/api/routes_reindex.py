from fastapi import APIRouter

from app.schemas.reindex import ReindexRequest, ReindexResponse

router = APIRouter(tags=["reindex"])


@router.post("/reindex", response_model=ReindexResponse)
async def reindex_playbook(request: ReindexRequest) -> ReindexResponse:
    return ReindexResponse(
        playbook_id=request.playbook_id,
        chunks_indexed=0,
        status="complete",
    )
