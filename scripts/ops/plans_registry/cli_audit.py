#!/usr/bin/env python3
"""CLI for plans audit and relocation reports."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from plans_registry.lib import (
    audit_items,
    discover_plan_files,
    find_repo_root,
    generate_audit_report_markdown,
    generate_relocation_map_markdown,
    load_plan_item,
    resolve_plans_dir,
)


def _repo_name(repo_root: Path) -> str:
    return repo_root.name


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Audit docs/plans - classify, report, relocation map."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="Git repo root (default: walk up from cwd)",
    )
    parser.add_argument(
        "--plans-dir",
        type=Path,
        default=None,
        help="Plans directory (default: <repo-root>/docs/plans)",
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Write PLANS_AUDIT_REPORT.md (default mode)",
    )
    parser.add_argument(
        "--relocation-map",
        action="store_true",
        help="Write RELOCATION_MAP.md",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print report to stdout instead of writing files",
    )
    parser.add_argument(
        "--count-links",
        action="store_true",
        help="Count inbound markdown links (slower)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    repo_root = args.repo_root or find_repo_root()
    plans_dir = args.plans_dir or resolve_plans_dir(repo_root)
    if not plans_dir.is_dir():
        print(f"plans dir not found: {plans_dir}", file=sys.stderr)
        return 1

    paths = discover_plan_files(plans_dir, include_archive=True)
    items = []
    for path in paths:
        rel = path.relative_to(plans_dir).as_posix()
        inbound = 0
        if args.count_links:
            from plans_registry.lib import count_inbound_links

            inbound = count_inbound_links(repo_root, rel)
        items.append(
            load_plan_item(path, plans_dir, repo_root, inbound_links=inbound)
        )
    audit_items(items)

    repo = _repo_name(repo_root)
    audit_cmd = "python scripts/ops/audit_plans.py --report --count-links"
    report_md = generate_audit_report_markdown(items, repo, audit_cmd)

    if args.stdout or (not args.report and not args.relocation_map):
        print(report_md)
    elif args.report:
        out = plans_dir / "PLANS_AUDIT_REPORT.md"
        out.write_text(report_md, encoding="utf-8")
        print(f"Wrote {out}")

    if args.relocation_map:
        reloc_md = generate_relocation_map_markdown(items, repo)
        reloc_path = plans_dir / "RELOCATION_MAP.md"
        reloc_path.write_text(reloc_md, encoding="utf-8")
        print(f"Wrote {reloc_path}")

    # Exit 1 if many work items lack frontmatter (CI signal for audit freshness)
    work = [i for i in items if i.classification == "work_item" and not i.in_archive]
    missing_fm = sum(1 for i in work if not i.frontmatter)
    if missing_fm and args.report and not args.stdout:
        print(
            f"Note: {missing_fm}/{len(work)} active work items lack frontmatter",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
