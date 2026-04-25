import io
import re
import shutil
import urllib.request
from functools import cached_property
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro


KOKORO_MODEL_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
    "kokoro-v1.0.onnx"
)
KOKORO_VOICES_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
    "voices-v1.0.bin"
)


class VoiceTtsError(RuntimeError):
    pass


class VoiceTtsService:
    def __init__(self, cache_dir: Path, voice: str, speed: float) -> None:
        self.cache_dir = cache_dir.expanduser()
        self.voice = voice
        self.speed = speed

    @cached_property
    def kokoro(self) -> Kokoro:
        model_file, voices_file = self._ensure_model_files()
        return Kokoro(str(model_file), str(voices_file))

    def warm_up(self) -> None:
        _kokoro = self.kokoro

    def synthesize_wav(self, text: str) -> bytes:
        clean_text = clean_spoken_text(text)
        if not clean_text:
            raise VoiceTtsError("Cannot synthesize empty text.")

        chunks: list[np.ndarray] = []
        sample_rate: int | None = None
        for sentence in split_spoken_sentences(clean_text):
            samples, sample_rate = self.kokoro.create(
                sentence,
                voice=self.voice,
                speed=self.speed,
            )
            chunks.append(np.asarray(samples, dtype=np.float32))
            chunks.append(np.zeros(int(sample_rate * 0.12), dtype=np.float32))

        if not chunks or sample_rate is None:
            raise VoiceTtsError("Text-to-speech produced no audio.")

        leading_pad = np.zeros(int(sample_rate * 0.28), dtype=np.float32)
        audio = np.concatenate([leading_pad, *chunks])
        output = io.BytesIO()
        sf.write(output, audio, sample_rate, format="WAV")
        return output.getvalue()

    def _ensure_model_files(self) -> tuple[Path, Path]:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        model_file = self.cache_dir / "kokoro-v1.0.onnx"
        voices_file = self.cache_dir / "voices-v1.0.bin"
        download_if_missing(KOKORO_MODEL_URL, model_file)
        download_if_missing(KOKORO_VOICES_URL, voices_file)
        return model_file, voices_file


def download_if_missing(url: str, destination: Path) -> None:
    if destination.exists():
        return
    temporary = destination.with_suffix(destination.suffix + ".download")
    try:
        with urllib.request.urlopen(url, timeout=60) as response, temporary.open("wb") as handle:
            shutil.copyfileobj(response, handle)
        temporary.replace(destination)
    except Exception as exc:
        temporary.unlink(missing_ok=True)
        raise VoiceTtsError(f"Could not download TTS model file `{destination.name}`.") from exc


def clean_spoken_text(text: str) -> str:
    without_markdown = re.sub(r"[*_`#>\[\]]", "", text)
    without_sources = re.sub(r"\s*Sources?:.*$", "", without_markdown, flags=re.IGNORECASE | re.DOTALL)
    return " ".join(without_sources.split())


def split_spoken_sentences(text: str, max_chars: int = 260) -> list[str]:
    sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text) if sentence.strip()]
    chunks: list[str] = []
    for sentence in sentences or [text]:
        if len(sentence) <= max_chars:
            chunks.append(sentence)
            continue
        words = sentence.split()
        current: list[str] = []
        for word in words:
            if current and len(" ".join([*current, word])) > max_chars:
                chunks.append(" ".join(current))
                current = [word]
            else:
                current.append(word)
        if current:
            chunks.append(" ".join(current))
    return chunks
