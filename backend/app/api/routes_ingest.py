import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.schemas.ids import ID_PATTERN
from app.schemas.ingest import (
    IngestDraftDetail,
    IngestUploadResponse,
    ListIngestDraftsResponse,
    PublishIngestResponse,
)
from app.services.chroma_store import ChromaStore
from app.services.embedding_cache import EmbeddingCache
from app.services.embedding_service import EmbeddingServiceError, GeminiEmbeddingService
from app.services.git_service import GitService, GitServiceError
from app.services.ingest_service import IngestError, IngestNotFoundError, IngestService
from app.services.playbook_extraction_service import (
    ExtractionMode,
    ExtractionSourceKind,
    PlaybookExtractionError,
    PlaybookExtractionService,
)
from app.services.retrieval_service import RetrievalService
from app.services.vault_service import VaultService

router = APIRouter(tags=["ingest"])


@router.post("/ingest", response_model=IngestUploadResponse)
async def upload_ingest(
    files: list[UploadFile] = File(...),
    playbook_id: str = Form("nda", pattern=ID_PATTERN),
    playbook_name: str = Form("NDA Playbook"),
    mode: ExtractionMode = Form("hybrid"),
    source_kind: ExtractionSourceKind = Form("playbook_source"),
) -> IngestUploadResponse:
    settings = get_settings()
    raw_paths = []
    upload_dir = settings.data_dir / "raw" / "uploads" / f"upload_{uuid4().hex}"
    upload_dir.mkdir(parents=True, exist_ok=True)
    try:
        for uploaded_file in files:
            filename = Path(uploaded_file.filename or "upload").name
            path = upload_dir / filename
            path.write_bytes(await uploaded_file.read())
            raw_paths.append(path)

        extractor = PlaybookExtractionService(
            playbook_id=playbook_id,
            mode=mode,
            gemini_api_key=settings.gemini_api_key,
            google_cloud_project=settings.google_cloud_project,
            google_cloud_location=settings.google_cloud_location,
            gemini_model=settings.gemini_model,
            source_kind=source_kind,
        )
        draft = await run_in_threadpool(
            IngestService(VaultService(settings.vault_dir), settings.data_dir).create_draft,
            playbook_id=playbook_id,
            playbook_name=playbook_name,
            source_paths=raw_paths,
            mode=mode,
            extractor=extractor,
            source_kind=source_kind,
        )
    except (IngestError, PlaybookExtractionError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)
    return IngestUploadResponse(**draft.model_dump())


@router.get("/ingest", response_model=ListIngestDraftsResponse)
async def list_ingests(playbook_id: str = "nda") -> ListIngestDraftsResponse:
    settings = get_settings()
    drafts = await run_in_threadpool(
        IngestService(VaultService(settings.vault_dir), settings.data_dir).list_drafts,
        playbook_id,
    )
    return ListIngestDraftsResponse(drafts=drafts)


@router.get("/ingest/{playbook_id}/{ingest_id}", response_model=IngestDraftDetail)
async def get_ingest(playbook_id: str, ingest_id: str) -> IngestDraftDetail:
    settings = get_settings()
    try:
        return await run_in_threadpool(
            IngestService(VaultService(settings.vault_dir), settings.data_dir).get_draft,
            playbook_id,
            ingest_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except IngestNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/ingest/{playbook_id}/{ingest_id}/publish", response_model=PublishIngestResponse)
async def publish_ingest(playbook_id: str, ingest_id: str) -> PublishIngestResponse:
    settings = get_settings()
    vault_service = VaultService(settings.vault_dir)
    ingest_service = IngestService(vault_service, settings.data_dir)
    try:
        count = await run_in_threadpool(ingest_service.publish_draft, playbook_id, ingest_id)
        retrieval_service = RetrievalService(
            vault_service=vault_service,
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
        await run_in_threadpool(retrieval_service.reindex_playbook, playbook_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except IngestNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (IngestError, EmbeddingServiceError, GitServiceError) as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return PublishIngestResponse(
        ingest_id=ingest_id,
        playbook_id=playbook_id,
        rules_published=count,
        reindexed=True,
    )
