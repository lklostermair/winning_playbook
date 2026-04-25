import tempfile
from functools import cached_property
from pathlib import Path

from faster_whisper import WhisperModel


class VoiceTranscriptionError(RuntimeError):
    pass


class VoiceTranscriptionService:
    def __init__(self, model: str, device: str, compute_type: str) -> None:
        self.model_name = model
        self.device = device
        self.compute_type = compute_type

    @cached_property
    def model(self) -> WhisperModel:
        return WhisperModel(
            self.model_name,
            device=self.device,
            compute_type=self.compute_type,
        )

    def warm_up(self) -> None:
        _model = self.model

    def transcribe(self, audio_bytes: bytes, suffix: str = ".webm") -> str:
        if not audio_bytes:
            raise VoiceTranscriptionError("Cannot transcribe an empty audio upload.")

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as audio_file:
            audio_file.write(audio_bytes)
            audio_file.flush()
            segments, _info = self.model.transcribe(
                audio_file.name,
                beam_size=5,
                vad_filter=True,
            )
            text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())

        if not text:
            raise VoiceTranscriptionError("No speech was detected in the recording.")
        return text


def audio_suffix(filename: str | None, content_type: str | None) -> str:
    if filename:
        suffix = Path(filename).suffix.lower()
        if suffix in {".webm", ".wav", ".mp3", ".m4a", ".mp4", ".ogg"}:
            return suffix
    if content_type == "audio/wav":
        return ".wav"
    if content_type == "audio/mpeg":
        return ".mp3"
    if content_type in {"audio/mp4", "audio/x-m4a"}:
        return ".m4a"
    if content_type == "audio/ogg":
        return ".ogg"
    return ".webm"
