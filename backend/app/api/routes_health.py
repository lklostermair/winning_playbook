from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from app.services.git_service import GitService

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/identity")
async def identity() -> dict[str, str | None]:
    return await run_in_threadpool(GitService().get_identity)
