#!/usr/bin/env python3
"""Apply YAML frontmatter to docs/plans work items missing it.

Usage:
  python scripts/ops/apply_frontmatter.py --write
  python scripts/ops/apply_frontmatter.py --write --priorities  # apply P0-P2 overrides

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

from plans_registry.lib import (
    discover_plan_files,
    extract_body_status,
    find_repo_root,
    infer_status_from_text,
    infer_type_from_name,
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

# (priority, rank) — migrated from CUTOVER_STATUS + agent queue
PRIORITY_OVERRIDES: dict[str, tuple[str, int]] = {
    "CLOUDFLARE_3BO_MOBI_DNS_CUTOVER_2026-08-03.md": ("P1", 1),
    "WWW_HOSTNAME_VS_PAGES_ORIGIN_2026-08-11.md": ("P1", 2),
    "WHATSAPP_DIRECT_WEBHOOK_SPEC.md": ("P1", 3),
    "WHATSAPP_BOT_RELIABILITY_AND_IDENTITY_TODO.md": ("P1", 4),
    "live_share_telemetry_SPEC.md": ("P1", 5),
    "cfg_profile_matrix_SPEC.md": ("P1", 6),
    "GITHUB_ACTIONS_OIDC_TODO.md": ("P1", 7),
    "GSC_API_AND_CLOUDFLARE_MOBI.md": ("P1", 8),
    "LAMBDA_ENV_SECRETS_EXPOSURE_SPEC.md": ("P1", 9),
    "WHATSAPP_META_BILLING_OCT2026_MITIGATION.md": ("P2", 10),
    "DEMO_PLACEMENT_AND_GSC_NOTES_2026-08-11.md": ("P2", 11),
    "whatsapp-twilio-to-meta-migration.md": ("P2", 20),
    "BRAND_ALIGNMENT_3BO_MOBI_SPEC.md": ("P2", 30),
    "DEVICE_ACTIVITY_TIMELINE_SPEC.md": ("P2", 40),
    "FLEET_LIVE_GROUP_SHARE_3D_SPEC.md": ("P3", 50),
    "SIMULATOR_IMPROVEMENTS_SPEC.md": ("P2", 45),
    "AWS_COST_AND_SECURITY_FOLLOWUPS_TODO.md": ("P3", 60),
}


def build_meta(path: Path, body: str, apply_priorities: bool) -> dict:
    name = path.name
    body_status = extract_body_status(body)
    status = infer_status_from_text(body_status or body[:600])
    meta = {
        "title": path.stem.replace("_", " "),
        "type": infer_type_from_name(name),
        "status": status,
        "priority": "P3",
        "rank": 999,
        "updated": date.today().isoformat(),
        "apps": [],
        "related": [],
        "evidence": None,
        "archived_date": None,
        "supersedes": None,
        "superseded_by": None,
    }
    if apply_priorities and name in PRIORITY_OVERRIDES:
        p, r = PRIORITY_OVERRIDES[name]
        meta["priority"] = p
        meta["rank"] = r
    return meta


def process_file(path: Path, dry_run: bool, apply_priorities: bool) -> str | None:
    text = path.read_text(encoding="utf-8")
    fm, body = parse_frontmatter(text)
    if fm and not apply_priorities:
        return None
    if fm and apply_priorities:
        name = path.name
        if name not in PRIORITY_OVERRIDES:
            return None
        p, r = PRIORITY_OVERRIDES[name]
        fm["priority"] = p
        fm["rank"] = r
        fm["updated"] = date.today().isoformat()
        new_text = render_frontmatter(fm) + body
        if not dry_run:
            path.write_text(new_text, encoding="utf-8")
        return f"priority {name} -> {p}/{r}"
    meta = build_meta(path, body, apply_priorities)
    new_text = render_frontmatter(meta) + ("\n" if not body.startswith("\n") else "") + body
    if not dry_run:
        path.write_text(new_text, encoding="utf-8")
    return f"frontmatter {path.name}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply plan frontmatter")
    parser.add_argument("--repo-root", type=Path, default=None)
    parser.add_argument("--write", action="store_true")
    parser.add_argument(
        "--priorities",
        action="store_true",
        help="Update priority/rank overrides (with or without new frontmatter)",
    )
    args = parser.parse_args()
    dry_run = not args.write
    repo = args.repo_root or find_repo_root()
    plans_dir = resolve_plans_dir(repo)
    paths = discover_plan_files(plans_dir, include_archive=False)
    changed = []
    for path in paths:
        if path.name in SKIP_NAMES:
            continue
        result = process_file(path, dry_run, args.priorities or not dry_run)
        if result:
            changed.append(result)
    for line in changed:
        print(line)
    print(f"Total: {len(changed)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
