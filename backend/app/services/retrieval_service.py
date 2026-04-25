from pathlib import Path
from typing import Any

from app.rag.chunking import CORE_INDEX_SECTIONS, MarkdownChunk, chunk_rule_markdown
from app.schemas.source import GitMetadata
from app.services.chroma_store import ChromaStore
from app.services.embedding_service import GeminiEmbeddingService
from app.services.git_service import GitService
from app.services.vault_service import VaultService


class RetrievalService:
    def __init__(
        self,
        vault_service: VaultService,
        git_service: GitService,
        embedding_service: GeminiEmbeddingService,
        chroma_store: ChromaStore,
    ) -> None:
        self.vault_service = vault_service
        self.git_service = git_service
        self.embedding_service = embedding_service
        self.chroma_store = chroma_store

    def reindex_playbook(self, playbook_id: str) -> int:
        chunks: list[MarkdownChunk] = []
        metadata: list[dict[str, Any]] = []
        for rule in self.vault_service.list_rules(playbook_id):
            markdown_path = self.vault_service.rule_markdown_path(playbook_id, rule.rule_id)
            markdown = self.vault_service.read_rule_markdown(playbook_id, rule.rule_id)
            git_metadata = self.git_service.get_last_change_metadata(markdown_path)
            rule_chunks = chunk_rule_markdown(
                playbook_id,
                rule.rule_id,
                markdown_path,
                markdown,
                include_sections=CORE_INDEX_SECTIONS,
            )
            chunks.extend(rule_chunks)
            metadata.extend(chunk_metadata(chunk, git_metadata) for chunk in rule_chunks)

        embeddings = self.embedding_service.embed_documents([chunk.text for chunk in chunks]) if chunks else []
        return self.chroma_store.replace_playbook_chunks(playbook_id, chunks, embeddings, metadata)

    def search(self, playbook_id: str, question: str, top_k: int = 5) -> list[dict[str, Any]]:
        query_embedding = self.embedding_service.embed_query(question)
        return self.chroma_store.query(playbook_id, query_embedding, top_k=top_k)


def chunk_metadata(chunk: MarkdownChunk, git_metadata: GitMetadata) -> dict[str, Any]:
    return {
        "playbook_id": chunk.playbook_id,
        "rule_id": chunk.rule_id,
        "topic": chunk.topic,
        "section": chunk.section,
        "source_file": str(chunk.source_file),
        "last_changed_by": git_metadata.last_changed_by,
        "last_changed_at": git_metadata.last_changed_at.isoformat(),
        "last_commit_hash": git_metadata.last_commit_hash,
        "last_commit_message": git_metadata.last_commit_message,
    }
