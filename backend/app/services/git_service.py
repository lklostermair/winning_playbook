import subprocess
import re
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.source import GitMetadata


class GitServiceError(RuntimeError):
    pass


class GitService:
    def __init__(self, repo_root: Path | None = None) -> None:
        self.repo_root = (repo_root or Path.cwd()).resolve()

    def get_last_change_metadata(self, file_path: Path) -> GitMetadata:
        relative_path = self._relative_path(file_path)
        result = self._run_git(
            "log",
            "-1",
            "--format=%an%x1f%aI%x1f%H%x1f%s",
            "--",
            str(relative_path),
            check=False,
        )
        if result.returncode != 0:
            raise GitServiceError(result.stderr.strip() or f"Could not read Git history for {relative_path}")
        output = result.stdout.strip()
        if not output:
            return GitMetadata(
                last_changed_by="uncommitted",
                last_changed_at=datetime.now(timezone.utc),
                last_commit_hash="uncommitted",
                last_commit_message=f"No committed Git history for {relative_path}",
            )

        parts = output.split("\x1f", maxsplit=3)
        if len(parts) != 4:
            raise GitServiceError(f"Unexpected git log output for {relative_path}: {output}")

        author, changed_at, commit_hash, message = parts
        return GitMetadata(
            last_changed_by=author,
            last_changed_at=datetime.fromisoformat(changed_at),
            last_commit_hash=commit_hash,
            last_commit_message=message,
        )

    def commit_files(self, file_paths: list[Path], message: str, author: str | None = None) -> str:
        if not file_paths:
            raise GitServiceError("No files were provided for commit.")

        self._ensure_git_author_config()
        relative_paths = [self._relative_path(path) for path in file_paths]
        self._run_git("add", "--", *(str(path) for path in relative_paths))

        diff_result = self._run_git("diff", "--cached", "--quiet", "--", *(str(path) for path in relative_paths), check=False)
        if diff_result.returncode == 0:
            raise GitServiceError("No staged changes to commit.")
        if diff_result.returncode != 1:
            raise GitServiceError(diff_result.stderr.strip() or "Failed to inspect staged Git changes.")

        command = ["commit", "-m", message]
        if author:
            command.extend(["--author", author])
        result = self._run_git(*command)
        commit_hash = self._run_git("rev-parse", "HEAD").stdout.strip()
        if not commit_hash:
            raise GitServiceError(result.stdout.strip() or "Git commit succeeded but no HEAD hash was returned.")
        return commit_hash

    def build_playbook_commit_message(self, playbook_id: str, rule_id: str, short_description: str) -> str:
        description = short_description.strip() or "update rule"
        return f"[playbook:{playbook_id}] Update {rule_id}: {description}"

    def get_identity(self) -> dict[str, str | None]:
        name = self._run_git("config", "--get", "user.name", check=False).stdout.strip()
        email = self._run_git("config", "--get", "user.email", check=False).stdout.strip()
        username = github_username_from_remote(
            self._run_git("remote", "get-url", "origin", check=False).stdout.strip()
        )
        return {
            "name": name or None,
            "email": email or None,
            "github_username": username or name or None,
            "avatar_url": f"https://github.com/{username}.png" if username else None,
        }

    def _relative_path(self, file_path: Path) -> Path:
        resolved = file_path.resolve()
        try:
            return resolved.relative_to(self.repo_root)
        except ValueError as exc:
            raise GitServiceError(f"Path is outside repository root: {file_path}") from exc

    def _ensure_git_author_config(self) -> None:
        missing = []
        for key in ("user.name", "user.email"):
            result = self._run_git("config", "--get", key, check=False)
            if result.returncode != 0 or not result.stdout.strip():
                missing.append(key)
        if missing:
            raise GitServiceError(
                "Git author configuration is missing: "
                + ", ".join(missing)
                + ". Configure it with `git config user.name ...` and `git config user.email ...`."
            )

    def _run_git(self, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            ["git", *args],
            cwd=self.repo_root,
            text=True,
            capture_output=True,
            check=False,
        )
        if check and result.returncode != 0:
            raise GitServiceError(result.stderr.strip() or result.stdout.strip() or f"Git command failed: git {' '.join(args)}")
        return result


def github_username_from_remote(remote_url: str) -> str | None:
    if not remote_url:
        return None
    match = re.search(r"github\.com[:/]([^/]+)/", remote_url)
    return match.group(1) if match else None
