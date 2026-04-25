from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import Settings, get_settings
from app.schemas.playbook import PlaybookSummary
from app.services.playbook_extraction_service import ExtractionMode, PlaybookExtractionService
from app.services.vault_service import VaultService

DEFAULT_SOURCE = ROOT_DIR / "data" / "examples" / "Sample NDA Playbook.docx"
DEFAULT_VAULT_DIR = ROOT_DIR / "vault"


def seed_playbook(
    *,
    sources: list[Path],
    vault_dir: Path,
    playbook_id: str,
    playbook_name: str,
    mode: ExtractionMode,
    settings: Settings,
    gemini_api_key: str | None = None,
    google_cloud_project: str | None = None,
    google_cloud_location: str | None = None,
    gemini_model: str | None = None,
    temperature: float = 0.4,
) -> int:
    extractor = PlaybookExtractionService(
        playbook_id=playbook_id,
        mode=mode,
        gemini_api_key=gemini_api_key if gemini_api_key is not None else settings.gemini_api_key,
        google_cloud_project=(
            google_cloud_project if google_cloud_project is not None else settings.google_cloud_project
        ),
        google_cloud_location=google_cloud_location or settings.google_cloud_location,
        gemini_model=gemini_model or settings.gemini_model,
        temperature=temperature,
    )
    rules = extractor.extract_rules([source.resolve() for source in sources])
    if not rules:
        raise RuntimeError("No playbook rules were extracted from the provided sources.")

    vault = VaultService(vault_dir)
    vault.write_playbook_manifest(
        PlaybookSummary(
            playbook_id=playbook_id,
            name=playbook_name,
            description=f"Extracted from {len(sources)} source file(s).",
        )
    )
    vault.clear_rules(playbook_id)
    for rule in rules:
        vault.write_rule(rule)
    return len(rules)


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(
        description="Extract playbook rules from Word/PDF/Excel/CSV files and write them to the vault."
    )
    parser.add_argument("sources", nargs="*", type=Path, default=[DEFAULT_SOURCE])
    parser.add_argument("--vault-dir", type=Path, default=settings.vault_dir or DEFAULT_VAULT_DIR)
    parser.add_argument("--playbook-id", default=settings.default_playbook_id)
    parser.add_argument("--playbook-name", default="NDA Playbook")
    parser.add_argument(
        "--mode",
        choices=["hybrid", "llm", "heuristic"],
        default="hybrid",
        help="hybrid uses Gemini via Vertex AI ADC or GEMINI_API_KEY when configured, otherwise local heuristics.",
    )
    parser.add_argument("--gemini-api-key", default=settings.gemini_api_key)
    parser.add_argument("--google-cloud-project", default=settings.google_cloud_project)
    parser.add_argument("--google-cloud-location", default=settings.google_cloud_location)
    parser.add_argument("--gemini-model", default=settings.gemini_model)
    parser.add_argument("--temperature", type=float, default=0.4)
    args = parser.parse_args()

    rule_count = seed_playbook(
        sources=args.sources,
        vault_dir=args.vault_dir,
        playbook_id=args.playbook_id,
        playbook_name=args.playbook_name,
        mode=args.mode,
        settings=settings,
        gemini_api_key=args.gemini_api_key,
        google_cloud_project=args.google_cloud_project,
        google_cloud_location=args.google_cloud_location,
        gemini_model=args.gemini_model,
        temperature=args.temperature,
    )
    target_dir = VaultService(args.vault_dir).playbook_dir(args.playbook_id)
    print(f"Extracted and wrote {rule_count} rules into {target_dir}")


if __name__ == "__main__":
    main()
