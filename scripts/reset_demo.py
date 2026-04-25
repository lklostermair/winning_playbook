from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings
from app.services.chroma_store import ChromaStore
from app.services.embedding_cache import EmbeddingCache
from app.services.embedding_service import EmbeddingServiceError, GeminiEmbeddingService
from app.services.git_service import GitService, GitServiceError
from app.services.retrieval_service import RetrievalService
from app.services.vault_service import VaultService
from seed_demo_data import DEFAULT_SOURCE, DEFAULT_VAULT_DIR, seed_playbook


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(
        description="Reset the local demo vault from the sample playbook and rebuild its index."
    )
    parser.add_argument("sources", nargs="*", type=Path, default=[DEFAULT_SOURCE])
    parser.add_argument("--vault-dir", type=Path, default=settings.vault_dir or DEFAULT_VAULT_DIR)
    parser.add_argument("--playbook-id", default=settings.default_playbook_id)
    parser.add_argument("--playbook-name", default="NDA Playbook")
    parser.add_argument("--mode", choices=["hybrid", "llm", "heuristic"], default="hybrid")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="confirm resetting a non-default playbook without an interactive prompt.",
    )
    parser.add_argument("--skip-index", action="store_true", help="reset the vault without rebuilding Chroma.")
    parser.add_argument(
        "--keep-review-state",
        action="store_true",
        help="keep proposed updates and ingest drafts instead of clearing them.",
    )
    args = parser.parse_args()

    settings.ensure_runtime_directories()
    vault = VaultService(args.vault_dir)

    if args.playbook_id != settings.default_playbook_id and not args.yes:
        answer = input(
            f"Reset playbook `{args.playbook_id}` in {args.vault_dir}? "
            "This replaces its official rules. Type the playbook id to continue: "
        )
        if answer != args.playbook_id:
            raise SystemExit("Reset cancelled.")

    if not args.keep_review_state:
        clear_review_state(vault, args.playbook_id)

    rule_count = seed_playbook(
        sources=args.sources,
        vault_dir=args.vault_dir,
        playbook_id=args.playbook_id,
        playbook_name=args.playbook_name,
        mode=args.mode,
        settings=settings,
    )
    print(f"Reset `{args.playbook_id}` vault with {rule_count} extracted rules.")

    if args.skip_index:
        print("Skipped Chroma reindex.")
        return

    try:
        chunks_indexed = reindex_playbook(args.playbook_id, vault, settings)
    except (EmbeddingServiceError, GitServiceError, ValueError) as exc:
        raise SystemExit(f"Reset wrote the vault, but reindex failed: {exc}") from exc
    print(f"Reindexed `{args.playbook_id}` with {chunks_indexed} chunks.")


def clear_review_state(vault: VaultService, playbook_id: str) -> None:
    for directory in (
        vault.proposed_updates_dir(playbook_id),
        vault.playbook_dir(playbook_id) / "draft_ingest",
    ):
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir(parents=True, exist_ok=True)


def reindex_playbook(playbook_id: str, vault: VaultService, settings) -> int:
    retrieval_service = RetrievalService(
        vault_service=vault,
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
    return retrieval_service.reindex_playbook(playbook_id)


if __name__ == "__main__":
    main()
