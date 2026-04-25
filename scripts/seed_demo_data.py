from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings
from app.schemas.playbook import PlaybookSummary
from app.services.playbook_extraction_service import ExtractionMode, PlaybookExtractionService
from app.services.vault_service import VaultService

DEFAULT_SOURCE = ROOT_DIR / "data" / "examples" / "Sample NDA Playbook.csv.xlsx"
DEFAULT_VAULT_DIR = ROOT_DIR / "vault"


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

    extractor = PlaybookExtractionService(
        playbook_id=args.playbook_id,
        mode=args.mode,
        gemini_api_key=args.gemini_api_key,
        google_cloud_project=args.google_cloud_project,
        google_cloud_location=args.google_cloud_location,
        gemini_model=args.gemini_model,
        temperature=args.temperature,
    )
    rules = extractor.extract_rules([source.resolve() for source in args.sources])
    if not rules:
        raise RuntimeError("No playbook rules were extracted from the provided sources.")

    vault = VaultService(args.vault_dir)
    vault.write_playbook_manifest(
        PlaybookSummary(
            playbook_id=args.playbook_id,
            name=args.playbook_name,
            description=f"Extracted from {len(args.sources)} source file(s).",
        )
    )
    vault.clear_rules(args.playbook_id)
    for rule in rules:
        vault.write_rule(rule)

    print(f"Extracted and wrote {len(rules)} rules into {vault.playbook_dir(args.playbook_id)}")


if __name__ == "__main__":
    main()
