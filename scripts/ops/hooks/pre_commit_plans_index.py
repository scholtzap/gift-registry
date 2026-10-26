#!/usr/bin/env python3
"""Git pre-commit helper: fail if PLANS_INDEX.md is stale vs docs/plans scan.

Used by .githooks/pre-commit when pre-commit framework is not installed.
Only runs refresh --check when staged files touch docs/plans/ (excluding archive-only
noise is still ok - any plans path triggers check).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def repo_root() -> Path:
    here = Path(__file__).resolve()
    # .cursor/hooks or scripts/ops/hooks → repo root
    for parent in here.parents:
        if (parent / ".git").is_dir():
            return parent
    return here.parents[2]


def staged_paths() -> list[str]:
    r = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
        capture_output=True,
        text=True,
        check=False,
    )
    if r.returncode != 0:
        return []
    return [p.strip() for p in r.stdout.splitlines() if p.strip()]


def main() -> int:
    root = repo_root()
    staged = staged_paths()
    if not any(p.replace("\\", "/").startswith("docs/plans/") for p in staged):
        return 0
    plans_dir = root / "docs" / "plans"
    if not plans_dir.is_dir():
        return 0
    refresh = root / "scripts" / "ops" / "refresh_plans_index.py"
    if not refresh.is_file():
        print("pre_commit_plans_index: missing scripts/ops/refresh_plans_index.py", file=sys.stderr)
        return 1
    print("Plans registry: checking PLANS_INDEX.md freshness (staged docs/plans/ changes)...")
    r = subprocess.run([sys.executable, str(refresh), "--check"], cwd=root)
    if r.returncode != 0:
        print(
            "PLANS_INDEX.md is stale. Run: python scripts/ops/refresh_plans_index.py --write",
            file=sys.stderr,
        )
    return r.returncode


if __name__ == "__main__":
    raise SystemExit(main())
