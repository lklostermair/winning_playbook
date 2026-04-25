import time
from typing import Literal

from google import genai
from google.genai import errors, types

from app.services.embedding_cache import EmbeddingCache


EmbeddingTaskType = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]


class EmbeddingServiceError(RuntimeError):
    pass


class GeminiEmbeddingService:
    def __init__(
        self,
        project: str | None,
        location: str,
        model: str,
        dimensions: int,
        batch_size: int = 16,
        request_delay_seconds: float = 1.0,
        api_key: str | None = None,
        cache: EmbeddingCache | None = None,
    ) -> None:
        self.project = project
        self.location = location
        self.model = model
        self.dimensions = dimensions
        self.batch_size = max(1, batch_size)
        self.request_delay_seconds = request_delay_seconds
        self.api_key = api_key
        self.cache = cache

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        embeddings: list[list[float] | None] = [None] * len(texts)
        misses: list[tuple[int, str]] = []
        for index, text in enumerate(texts):
            if not text.strip():
                raise EmbeddingServiceError("Cannot embed empty text.")
            cached = self._cache_get(text, "RETRIEVAL_DOCUMENT")
            if cached is None:
                misses.append((index, text))
            else:
                embeddings[index] = cached

        for batch_index, start in enumerate(range(0, len(misses), self.batch_size)):
            if batch_index > 0 and self.request_delay_seconds > 0:
                time.sleep(self.request_delay_seconds)
            batch = misses[start : start + self.batch_size]
            batch_embeddings = self._embed_text_batch([text for _index, text in batch], "RETRIEVAL_DOCUMENT")
            for (original_index, text), embedding in zip(batch, batch_embeddings, strict=True):
                embeddings[original_index] = embedding
                self._cache_set(text, "RETRIEVAL_DOCUMENT", embedding, persist=False)

        if misses and self.cache is not None:
            self.cache.save()

        return [_require_embedding(embedding) for embedding in embeddings]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_text(text, "RETRIEVAL_QUERY")

    def embed_text(self, text: str, task_type: EmbeddingTaskType) -> list[float]:
        embedding, _cache_hit = self._embed_text_with_cache_status(text, task_type)
        return embedding

    def _embed_text_with_cache_status(self, text: str, task_type: EmbeddingTaskType) -> tuple[list[float], bool]:
        if not text.strip():
            raise EmbeddingServiceError("Cannot embed empty text.")

        cached = self._cache_get(text, task_type)
        if cached is not None:
            return cached, True

        embedding = self._embed_text_batch([text], task_type)[0]
        self._cache_set(text, task_type, embedding)
        return embedding, False

    def _embed_text_batch(self, texts: list[str], task_type: EmbeddingTaskType) -> list[list[float]]:
        client = self._client()
        response = None
        for attempt in range(7):
            try:
                response = client.models.embed_content(
                    model=self.model,
                    contents=texts,
                    config=types.EmbedContentConfig(
                        task_type=task_type,
                        output_dimensionality=self.dimensions,
                    ),
                )
                break
            except errors.APIError as exc:
                if getattr(exc, "code", None) != 429 or attempt == 6:
                    raise EmbeddingServiceError(f"Gemini embedding request failed: {exc}") from exc
                time.sleep(min(60, 5 * (attempt + 1)))

        if response is None or len(response.embeddings) != len(texts):
            raise EmbeddingServiceError("Gemini returned an unexpected embedding count.")
        return [list(embedding.values) for embedding in response.embeddings]

    def _cache_get(self, text: str, task_type: EmbeddingTaskType) -> list[float] | None:
        if self.cache is None:
            return None
        return self.cache.get(
            provider="gemini",
            model=self.model,
            dimensions=self.dimensions,
            task_type=task_type,
            text=text,
        )

    def _cache_set(
        self,
        text: str,
        task_type: EmbeddingTaskType,
        embedding: list[float],
        persist: bool = True,
    ) -> None:
        if self.cache is None:
            return
        self.cache.set(
            provider="gemini",
            model=self.model,
            dimensions=self.dimensions,
            task_type=task_type,
            text=text,
            embedding=embedding,
            persist=persist,
        )

    def _client(self) -> genai.Client:
        if self.project:
            return genai.Client(vertexai=True, project=self.project, location=self.location)
        if self.api_key:
            return genai.Client(api_key=self.api_key)
        raise EmbeddingServiceError(
            "Gemini embeddings require GOOGLE_CLOUD_PROJECT for Vertex AI ADC or GEMINI_API_KEY."
        )


def _require_embedding(embedding: list[float] | None) -> list[float]:
    if embedding is None:
        raise EmbeddingServiceError("Embedding batch left an empty result.")
    return embedding
