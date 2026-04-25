from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.schemas.update import (
    ApproveUpdateRequest,
    CreateProposedUpdateRequest,
    CreateProposedUpdateResponse,
    ListProposedUpdatesResponse,
    RejectUpdateRequest,
    UpdateDecisionResponse,
)
from app.services.chroma_store import ChromaStore
from app.services.embedding_cache import EmbeddingCache
from app.services.embedding_service import EmbeddingServiceError, GeminiEmbeddingService
from app.services.git_service import GitService, GitServiceError
from app.services.proposed_update_service import (
    ProposedUpdateError,
    ProposedUpdateNotFoundError,
    ProposedUpdateService,
)
from app.services.retrieval_service import RetrievalService
from app.services.vault_service import RuleNotFoundError, VaultService

router = APIRouter(tags=["updates"])


@router.post("/updates", response_model=CreateProposedUpdateResponse)
async def create_update(request: CreateProposedUpdateRequest) -> CreateProposedUpdateResponse:
    service = ProposedUpdateService(VaultService(get_settings().vault_dir))
    try:
        record = service.create_update(request)
    except (ProposedUpdateError, RuleNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return CreateProposedUpdateResponse(update_id=record.update_id, status=record.status)


@router.get("/updates", response_model=ListProposedUpdatesResponse)
async def list_updates(playbook_id: str = "nda") -> ListProposedUpdatesResponse:
    service = ProposedUpdateService(VaultService(get_settings().vault_dir))
    return ListProposedUpdatesResponse(updates=service.list_updates(playbook_id))


@router.post("/updates/{update_id}/approve", response_model=UpdateDecisionResponse)
async def approve_update(
    update_id: str,
    request: ApproveUpdateRequest,
) -> UpdateDecisionResponse:
    settings = get_settings()
    vault_service = VaultService(settings.vault_dir)
    update_service = ProposedUpdateService(vault_service)
    git_service = GitService()
    retrieval_service = build_retrieval_service(settings, vault_service, git_service)
    try:
        record, _rule = update_service.approve_update(update_id, request.approved_by)
        commit_hash = git_service.commit_files(
            [
                vault_service.rule_json_path(record.playbook_id, record.target_rule_id),
                vault_service.rule_markdown_path(record.playbook_id, record.target_rule_id),
                *update_service.update_paths(record),
            ],
            git_service.build_playbook_commit_message(
                record.playbook_id,
                record.target_rule_id,
                f"approve update {record.update_id}",
            ),
        )
        retrieval_service.reindex_playbook(record.playbook_id)
    except ProposedUpdateNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (ProposedUpdateError, RuleNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except (GitServiceError, EmbeddingServiceError) as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return UpdateDecisionResponse(
        update_id=record.update_id,
        status=record.status,
        commit_hash=commit_hash,
        reindexed=True,
    )


@router.post("/updates/{update_id}/reject", response_model=UpdateDecisionResponse)
async def reject_update(
    update_id: str,
    request: RejectUpdateRequest,
) -> UpdateDecisionResponse:
    service = ProposedUpdateService(VaultService(get_settings().vault_dir))
    try:
        record = service.reject_update(update_id, request.rejected_by, request.reason)
    except ProposedUpdateNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProposedUpdateError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return UpdateDecisionResponse(
        update_id=record.update_id,
        status=record.status,
        commit_hash=None,
        reindexed=False,
    )


def build_retrieval_service(settings, vault_service: VaultService, git_service: GitService) -> RetrievalService:
    return RetrievalService(
        vault_service=vault_service,
        git_service=git_service,
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
