from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings


@dataclass
class Check:
    level: str
    message: str
    detail: str | None = None


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate local settings needed for the demo.")
    parser.add_argument(
        "--strict-ai",
        action="store_true",
        help="fail when Gemini generation/embedding credentials are not configured.",
    )
    args = parser.parse_args()

    settings = get_settings()
    checks: list[Check] = []

    require_file(checks, ROOT_DIR / "pyproject.toml", "Python project metadata exists")
    require_file(checks, ROOT_DIR / "uv.lock", "uv lockfile exists")
    require_file(checks, ROOT_DIR / "frontend" / "package.json", "Frontend package metadata exists")
    require_file(checks, ROOT_DIR / "frontend" / "package-lock.json", "Frontend npm lockfile exists")
    require_file(
        checks,
        ROOT_DIR / "data" / "examples" / "Sample NDA Playbook.docx",
        "Default DOCX playbook source exists",
    )
    require_file(
        checks,
        ROOT_DIR / "data" / "examples" / "Sample NDA Playbook.csv.xlsx",
        "Structured fallback playbook source exists",
    )

    for directory, label in (
        (settings.vault_dir, "Vault directory"),
        (settings.data_dir, "Data directory"),
        (settings.chroma_dir, "Chroma directory"),
    ):
        checks.append(Check("ok" if directory.exists() else "warn", f"{label}: {directory}"))

    env_path = ROOT_DIR / ".env"
    checks.append(
        Check(
            "ok" if env_path.exists() else "warn",
            ".env file",
            "Using defaults and process environment." if not env_path.exists() else None,
        )
    )

    adc_path = configured_adc_path(settings.google_application_credentials)
    has_adc = adc_path is not None and adc_path.exists()
    has_generation_config = bool(settings.google_cloud_project and has_adc) or bool(settings.gemini_api_key)
    credential_level = "ok" if has_generation_config else ("fail" if args.strict_ai else "warn")
    checks.append(
        Check(
            credential_level,
            "Gemini generation credentials",
            credential_detail(settings.google_cloud_project, settings.gemini_api_key, adc_path),
        )
    )

    has_embedding_config = bool(settings.google_cloud_project and has_adc) or bool(settings.gemini_api_key)
    embedding_level = "ok" if has_embedding_config else ("fail" if args.strict_ai else "warn")
    checks.append(
        Check(
            embedding_level,
            "Gemini embedding credentials",
            credential_detail(settings.google_cloud_project, settings.gemini_api_key, adc_path),
        )
    )

    checks.append(
        Check(
            "ok" if settings.gemini_embedding_dimensions > 0 else "fail",
            f"Embedding dimensions: {settings.gemini_embedding_dimensions}",
        )
    )
    checks.append(Check("ok", f"Default playbook id: {settings.default_playbook_id}"))
    checks.append(Check("ok", f"Frontend origins: {', '.join(settings.allowed_frontend_origins)}"))

    for check in checks:
        print(format_check(check))

    failures = [check for check in checks if check.level == "fail"]
    if failures:
        raise SystemExit(1)


def require_file(checks: list[Check], path: Path, message: str) -> None:
    checks.append(Check("ok" if path.exists() else "fail", message, str(path)))


def configured_adc_path(google_application_credentials: str | None) -> Path | None:
    if google_application_credentials:
        return Path(google_application_credentials).expanduser()
    return (
        Path(os.environ.get("HOME", "~")).expanduser()
        / ".config"
        / "gcloud"
        / "application_default_credentials.json"
    )


def credential_detail(project: str | None, api_key: str | None, adc_path: Path | None) -> str:
    if api_key:
        return "GEMINI_API_KEY is configured."
    if project and adc_path and adc_path.exists():
        return f"GOOGLE_CLOUD_PROJECT={project}; ADC={adc_path}"
    if project:
        return f"GOOGLE_CLOUD_PROJECT={project}; ADC credentials were not found."
    return "Set GOOGLE_CLOUD_PROJECT with ADC, or GEMINI_API_KEY."


def format_check(check: Check) -> str:
    prefix = {"ok": "[ok]", "warn": "[warn]", "fail": "[fail]"}[check.level]
    if check.detail:
        return f"{prefix} {check.message} - {check.detail}"
    return f"{prefix} {check.message}"


if __name__ == "__main__":
    main()
