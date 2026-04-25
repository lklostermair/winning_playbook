from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.schemas.chat import AskQuestionRequest, AskQuestionResponse
from app.services.answer_generation_service import AnswerGenerationError, GeminiAnswerGenerationService
from app.services.ask_service import AskService
from app.services.chroma_store import ChromaStore
from app.services.embedding_cache import EmbeddingCache
from app.services.embedding_service import EmbeddingServiceError, GeminiEmbeddingService
from app.services.git_service import GitService, GitServiceError
from app.services.retrieval_service import RetrievalService
from app.services.vault_service import VaultService

router = APIRouter(tags=["chat"])


@router.post("/ask", response_model=AskQuestionResponse)
async def ask_playbook(request: AskQuestionRequest) -> AskQuestionResponse:
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
    ask_service = AskService(
        retrieval_service=retrieval_service,
        answer_generation_service=GeminiAnswerGenerationService(
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
            model=settings.gemini_model,
            api_key=settings.gemini_api_key,
        ),
    )
    try:
        return ask_service.ask(request.playbook_id, request.question)
    except (AnswerGenerationError, EmbeddingServiceError, GitServiceError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
