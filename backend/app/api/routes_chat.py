from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.schemas.chat import (
    AskQuestionRequest,
    AskQuestionResponse,
    GenerateChatTitleRequest,
    GenerateChatTitleResponse,
)
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
        playbook_ids = request.playbook_ids or [request.playbook_id]
        return await run_in_threadpool(ask_service.ask, playbook_ids, request.question, request.conversation)
    except (AnswerGenerationError, EmbeddingServiceError, GitServiceError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.post("/chat/title", response_model=GenerateChatTitleResponse)
async def generate_chat_title(request: GenerateChatTitleRequest) -> GenerateChatTitleResponse:
    settings = get_settings()
    service = GeminiAnswerGenerationService(
        project=settings.google_cloud_project,
        location=settings.google_cloud_location,
        model=settings.gemini_model,
        api_key=settings.gemini_api_key,
    )
    try:
        title = await run_in_threadpool(service.generate_chat_title, request.question)
        return GenerateChatTitleResponse(title=title)
    except AnswerGenerationError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
