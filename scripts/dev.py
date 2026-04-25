import argparse
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = REPO_ROOT / "frontend"


COMMANDS = {
    "backend": [
        "uv",
        "run",
        "uvicorn",
        "app.main:app",
        "--app-dir",
        "backend",
        "--reload",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
    ],
    "frontend": ["npm", "run", "dev"],
    "frontend-install": ["npm", "install"],
    "frontend-build": ["npm", "run", "build"],
    "frontend-lint": ["npm", "run", "lint"],
    "reset-demo": [sys.executable, "scripts/reset_demo.py"],
    "smoke-demo": [sys.executable, "scripts/smoke_demo.py"],
    "test": [sys.executable, "-m", "unittest", "discover", "-s", "tests"],
    "validate-demo": [sys.executable, "scripts/validate_demo_env.py", "--strict-ai"],
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run local development commands.")
    parser.add_argument("command", choices=sorted(COMMANDS))
    args = parser.parse_args()

    command = COMMANDS[args.command]
    cwd = FRONTEND_DIR if args.command.startswith("frontend") else REPO_ROOT
    subprocess.run(command, cwd=cwd, check=True)


if __name__ == "__main__":
    main()
