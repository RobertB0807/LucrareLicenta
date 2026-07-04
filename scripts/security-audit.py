from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

BLOCKED_TRACKED_PATH_PATTERNS = (
    re.compile(r"(^|/)\.env$"),
    re.compile(r"(^|/)\.env\.local$"),
    re.compile(r"firebase-adminsdk.*\.json$", re.IGNORECASE),
    re.compile(r"(service-account|credentials).*\.(json|pem|key)$", re.IGNORECASE),
)

SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("private key", re.compile(r"-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----")),
    ("firebase web api key", re.compile(r"AIza[0-9A-Za-z_-]{30,}")),
    (
        "firebase service account private_key",
        re.compile(r'"private_key"\s*:\s*"[^"]+BEGIN PRIVATE KEY', re.IGNORECASE),
    ),
    (
        "smtp password",
        re.compile(
            r"^LIVE_DRILL_SMTP_PASSWORD=(?!$|replace-with|your-|example-|<|secret-placeholder)",
            re.MULTILINE,
        ),
    ),
    (
        "production jwt secret",
        re.compile(
            r"^JWT_SECRET_KEY=(?!$|replace-with|dev-insecure-secret-change-me|your-|example-|<)",
            re.MULTILINE,
        ),
    ),
    (
        "database password",
        re.compile(
            r"^POSTGRES_PASSWORD=(?!$|replace-with|your-|example-|<)",
            re.MULTILINE,
        ),
    ),
)

IGNORED_FILES = {
    "scripts/security-audit.py",
    "CyberSecurityApp/package-lock.json",
}


def git_ls_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    return [line for line in result.stdout.splitlines() if line.strip()]


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, UnicodeDecodeError):
        return None


def main() -> int:
    findings: list[str] = []
    tracked_files = git_ls_files()

    for relative_path in tracked_files:
        normalized = relative_path.replace("\\", "/")
        if normalized in IGNORED_FILES:
            continue

        for pattern in BLOCKED_TRACKED_PATH_PATTERNS:
            if pattern.search(normalized):
                findings.append(f"tracked sensitive file: {normalized}")

        text = read_text(ROOT / normalized)
        if text is None:
            continue

        for label, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                findings.append(f"{label} in {normalized}")

    if findings:
        print("Security audit failed. Remove real secrets from tracked files:", file=sys.stderr)
        for finding in findings:
            print(f"- {finding}", file=sys.stderr)
        return 1

    print("Security audit passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
