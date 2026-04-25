from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.schemas.voice import VoiceSpeakRequest, VoiceTranscriptionResponse, VoiceWarmupResponse
from app.services.voice_transcription_service import (
    VoiceTranscriptionError,
    VoiceTranscriptionService,
    audio_suffix,
)
from app.services.voice_tts_service import VoiceTtsError, VoiceTtsService

router = APIRouter(tags=["voice"])


@router.post("/voice/warmup", response_model=VoiceWarmupResponse)
async def warmup_voice() -> VoiceWarmupResponse:
    settings = get_settings()
    service = get_voice_transcription_service(
        settings.voice_whisper_model,
        settings.voice_whisper_device,
        settings.voice_whisper_compute_type,
    )
    tts_service = get_voice_tts_service(
        str(settings.voice_tts_cache_dir),
        settings.voice_tts_voice,
        settings.voice_tts_speed,
    )
    try:
        await run_in_threadpool(service.warm_up)
        await run_in_threadpool(tts_service.warm_up)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice model warmup failed: {exc}",
        ) from exc
    return VoiceWarmupResponse(status="ready")


@router.post("/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(audio: UploadFile = File(...)) -> VoiceTranscriptionResponse:
    settings = get_settings()
    audio_bytes = await audio.read()
    if len(audio_bytes) > settings.voice_upload_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Voice recording is too large.",
        )

    service = get_voice_transcription_service(
        settings.voice_whisper_model,
        settings.voice_whisper_device,
        settings.voice_whisper_compute_type,
    )
    try:
        text = await run_in_threadpool(
            service.transcribe,
            audio_bytes,
            audio_suffix(audio.filename, audio.content_type),
        )
    except VoiceTranscriptionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice transcription failed: {exc}",
        ) from exc
    return VoiceTranscriptionResponse(text=text)


@router.post("/voice/speak")
async def speak_voice(request: VoiceSpeakRequest) -> Response:
    settings = get_settings()
    service = get_voice_tts_service(
        str(settings.voice_tts_cache_dir),
        settings.voice_tts_voice,
        settings.voice_tts_speed,
    )
    try:
        audio = await run_in_threadpool(service.synthesize_wav, request.text)
    except VoiceTtsError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice synthesis failed: {exc}",
        ) from exc
    return Response(content=audio, media_type="audio/wav")


@lru_cache(maxsize=4)
def get_voice_transcription_service(
    model: str,
    device: str,
    compute_type: str,
) -> VoiceTranscriptionService:
    return VoiceTranscriptionService(model=model, device=device, compute_type=compute_type)


@lru_cache(maxsize=8)
def get_voice_tts_service(cache_dir: str, voice: str, speed: float) -> VoiceTtsService:
    return VoiceTtsService(cache_dir=Path(cache_dir), voice=voice, speed=speed)
