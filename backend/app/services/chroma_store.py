import logging
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings

from app.rag.chunking import MarkdownChunk

COLLECTION_NAME = "playbook_chunks"
logging.getLogger("chromadb.telemetry.product.posthog").disabled = True


class ChromaStore:
    def __init__(self, chroma_dir: Path) -> None:
        self.client = chromadb.PersistentClient(
            path=str(chroma_dir),
            settings=Settings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    def replace_playbook_chunks(self, playbook_id: str, chunks: list[MarkdownChunk], embeddings: list[list[float]], metadata: list[dict[str, Any]]) -> int:
        existing = self.collection.get(where={"playbook_id": playbook_id}, include=[])
        existing_ids = existing.get("ids", [])
        if existing_ids:
            self.collection.delete(ids=existing_ids)
        if not chunks:
            return 0
        self.collection.add(
            ids=[chunk.chunk_id for chunk in chunks],
            documents=[chunk.text for chunk in chunks],
            embeddings=embeddings,
            metadatas=metadata,
        )
        return len(chunks)

    def query(self, playbook_id: str, query_embedding: list[float], top_k: int = 5) -> list[dict[str, Any]]:
        return self.query_playbooks([playbook_id], query_embedding, top_k=top_k)

    def query_playbooks(self, playbook_ids: list[str], query_embedding: list[float], top_k: int = 5) -> list[dict[str, Any]]:
        where: dict[str, Any]
        if len(playbook_ids) == 1:
            where = {"playbook_id": playbook_ids[0]}
        else:
            where = {"playbook_id": {"$in": playbook_ids}}
        result = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
        ids = result.get("ids", [[]])[0]
        documents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]
        hits = []
        for chunk_id, document, metadata, distance in zip(ids, documents, metadatas, distances, strict=False):
            hits.append(
                {
                    "chunk_id": chunk_id,
                    "document": document,
                    "metadata": metadata,
                    "distance": distance,
                    "score": max(0.0, 1.0 - float(distance)),
                }
            )
        return hits
