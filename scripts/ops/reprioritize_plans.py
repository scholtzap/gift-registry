#!/usr/bin/env python3
"""Batch reprioritize P3 docs/plans ranks (and optional P2 hold items).

Usage:
  python scripts/ops/reprioritize_plans.py --write
  python scripts/ops/reprioritize_plans.py --dry-run

Spec: docs/plans/PLANS_WORK_REGISTRY_SPEC.md
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

_OPS = Path(__file__).resolve().parent
if str(_OPS) not in sys.path:
    sys.path.insert(0, str(_OPS))

from plans_registry.constants import P3_EXPLICIT_RANKS, heuristic_p3_rank
from plans_registry.lib import (
    discover_plan_files,
    find_repo_root,
    parse_frontmatter,
    render_frontmatter,
    resolve_plans_dir,
)

SKIP_NAMES = frozenset(
    {
        "PLANS_INDEX.md",
        "PLANS_AUDIT_REPORT.md",
        "RELOCATION_MAP.md",
        "PLANS_WORK_REGISTRY_SPEC.md",
        "PLANS_ARCHIVE_HOLD.md",
    }
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Reprioritize P3 plan ranks")
    parser.add_argument("--repo-root", type=Path, default=None)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    dry_run = args.dry_run or not args.write

    repo = args.repo_root or find_repo_root()
    plans_dir = resolve_plans_dir(repo)
    paths = [
        p
        for p in discover_plan_files(plans_dir, include_archive=False)
        if p.name not in SKIP_NAMES
    ]

    changed = 0
    for path in paths:
        text = path.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)
        if not fm:
            continue
        priority = str(fm.get("priority", "P3"))
        if priority != "P3":
            continue
        status = str(fm.get("status", "draft"))
        new_rank = heuristic_p3_rank(path.name, status)
        old_rank = fm.get("rank", 999)
        if int(old_rank) == new_rank:
            continue
        fm["rank"] = new_rank
        fm["updated"] = date.today().isoformat()
        if dry_run:
            print(f"  {path.name}: rank {old_rank} -> {new_rank} ({priority})")
        else:
            path.write_text(render_frontmatter(fm) + body, encoding="utf-8")
            print(f"  {path.name}: rank -> {new_rank}")
        changed += 1

    print(f"Updated {changed} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
