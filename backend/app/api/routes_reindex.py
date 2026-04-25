from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.schemas.reindex import ReindexRequest, ReindexResponse
from app.services.chroma_store import ChromaStore
from app.services.embedding_cache import EmbeddingCache
from app.services.embedding_service import EmbeddingServiceError, GeminiEmbeddingService
from app.services.git_service import GitService, GitServiceError
from app.services.retrieval_service import RetrievalService
from app.services.vault_service import VaultService

router = APIRouter(tags=["reindex"])


@router.post("/reindex", response_model=ReindexResponse)
async def reindex_playbook(request: ReindexRequest) -> ReindexResponse:
    settings = get_settings()
    retrieval_service = RetrievalService(
        vault_service=VaultService(settings.vault_dir),
        git_service=GitService(),
        embedding_service=GeminiEmbeddingService(
            project=settings.google_cloud_project,
            location=settings.gemini_embedding_location,
            model=settings.gemini_embedding_model,
            dimensions=settings.gemini_embedding_dimensions,
            batch_size=settings.gemini_embedding_batch_size,
            request_delay_seconds=settings.gemini_embedding_request_delay_seconds,
            api_key=settings.gemini_api_key,
            cache=EmbeddingCache(settings.chroma_dir / "embedding_cache.json"),
        ),
        chroma_store=ChromaStore(settings.chroma_dir),
    )
    try:
        chunks_indexed = await run_in_threadpool(retrieval_service.reindex_playbook, request.playbook_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except (EmbeddingServiceError, GitServiceError) as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return ReindexResponse(
        playbook_id=request.playbook_id,
        chunks_indexed=chunks_indexed,
        status="complete",
    )
