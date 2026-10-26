#!/usr/bin/env python3
"""CLI for PLANS_INDEX.md generation and staleness checks."""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from plans_registry.lib import (
    audit_items,
    content_hash,
    discover_plan_files,
    find_repo_root,
    generate_index_markdown,
    load_plan_item,
    resolve_plans_dir,
    stable_hash,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate or verify docs/plans/PLANS_INDEX.md"
    )
    parser.add_argument("--repo-root", type=Path, default=None)
    parser.add_argument("--plans-dir", type=Path, default=None)
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write PLANS_INDEX.md",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 if PLANS_INDEX.md is stale vs scan",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print index to stdout",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.write and not args.check and not args.stdout:
        args.check = True

    repo_root = args.repo_root or find_repo_root()
    plans_dir = args.plans_dir or resolve_plans_dir(repo_root)
    if not plans_dir.is_dir():
        print(f"plans dir not found: {plans_dir}", file=sys.stderr)
        return 1

    paths = discover_plan_files(plans_dir, include_archive=True)
    items = [
        load_plan_item(p, plans_dir, repo_root)
        for p in paths
    ]
    audit_items(items)

    refresh_cmd = "python scripts/ops/refresh_plans_index.py --write"
    index_md = generate_index_markdown(items, repo_root.name, refresh_cmd)
    index_path = plans_dir / "PLANS_INDEX.md"

    if args.stdout:
        print(index_md)
        return 0

    if args.write:
        index_path.write_text(index_md, encoding="utf-8")
        print(f"Wrote {index_path} (hash {content_hash(index_md)})")
        return 0

    if args.check:
        if not index_path.is_file():
            print(f"MISSING: {index_path}", file=sys.stderr)
            return 1
        existing = index_path.read_text(encoding="utf-8")
        if stable_hash(existing) != stable_hash(index_md):
            print(
                "STALE: PLANS_INDEX.md does not match scan. "
                "Run: python scripts/ops/refresh_plans_index.py --write",
                file=sys.stderr,
            )
            return 1
        print(f"OK: {index_path} is fresh")
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
