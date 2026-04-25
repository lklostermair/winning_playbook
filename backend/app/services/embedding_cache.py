import hashlib
import json
from pathlib import Path


class EmbeddingCache:
    def __init__(self, cache_path: Path) -> None:
        self.cache_path = cache_path
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self._entries = self._load()

    def get(
        self,
        *,
        provider: str,
        model: str,
        dimensions: int,
        task_type: str,
        text: str,
    ) -> list[float] | None:
        return self._entries.get(self._key(provider, model, dimensions, task_type, text))

    def set(
        self,
        *,
        provider: str,
        model: str,
        dimensions: int,
        task_type: str,
        text: str,
        embedding: list[float],
        persist: bool = True,
    ) -> None:
        self._entries[self._key(provider, model, dimensions, task_type, text)] = embedding
        if persist:
            self.save()

    def save(self) -> None:
        with self.cache_path.open("w", encoding="utf-8") as cache_file:
            json.dump(self._entries, cache_file)

    def _load(self) -> dict[str, list[float]]:
        if not self.cache_path.exists():
            return {}
        with self.cache_path.open("r", encoding="utf-8") as cache_file:
            data = json.load(cache_file)
        if not isinstance(data, dict):
            return {}
        return {str(key): value for key, value in data.items() if _is_embedding(value)}

    @staticmethod
    def _key(provider: str, model: str, dimensions: int, task_type: str, text: str) -> str:
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return f"{provider}:{model}:{dimensions}:{task_type}:{digest}"


def _is_embedding(value: object) -> bool:
    return isinstance(value, list) and all(isinstance(item, (int, float)) for item in value)
