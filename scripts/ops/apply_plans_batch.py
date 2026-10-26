#!/usr/bin/env python3
"""Batch archive / relocate docs/plans files and fix inbound markdown links.

Usage:
  python scripts/ops/apply_plans_batch.py archive --repo-root .
  python scripts/ops/apply_plans_batch.py relocate --repo-root .
  python scripts/ops/apply_plans_batch.py all --repo-root .

Spec: docs/plans/PLANS_WORK_REGISTRY_SPEC.md
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path

_OPS = Path(__file__).resolve().parent
if str(_OPS) not in sys.path:
    sys.path.insert(0, str(_OPS))

SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", ".serverless"}

from plans_registry.constants import ARCHIVE_HOLD, AUTO_ARCHIVE_STATUSES, evidence_set

# Active copies where archive/ already has canonical full doc — delete active only
ARCHIVE_DUPLICATE_DELETE = frozenset(
    {
        "fleet_map_pin_popup_SPEC.md",
        "manual_device_images_TODO.md",
        "ORG_SCOPED_DEVICES_SPEC.md",
        "remove_open_map_button_TODO.md",
        "site_consolidation_3bo_SPEC.md",
        "SITE_CONSOLIDATION_AND_ADMIN_OAUTH_SPEC.md",
        "TEAM_MESSAGES_CUTOVER_2026-08-02.md",
        "TODO_start_odt_mode_refactor.md",
    }
)

# From PLANS_AUDIT_REPORT archive_candidate minus ARCHIVE_HOLD
ARCHIVE_MOVE = [
    "3BO_WEB_APP_FINALIZATION_PROGRAMME_SPEC.md",
    "ADMIN_AUTH_401_DEFERRED_2026-08-13.md",
    "ADMIN_DUPLICATE_SIM_FLAG_SPEC.md",
    "AIOSEO_REMAINING_TODO_2026-08-03.md",
    "CF_PAGES_ANALYTICS_GA4_OPTIONS_2026-08-11.md",
    "CF_WEB_ANALYTICS_RUM_AND_ZARAZ_2026-08-11.md",
    "DEVICES_DATETIMEFORMAT_BLANK_BUGFIX.md",
    "DEVICE_WHATSAPP_QR_STICKER_SPEC.md",
    "FLEET_AUTH_EMAIL_AND_MICROSOFT_SPEC.md",
    "FLEET_DEVICE_TABLE_SPEC.md",
    "FLEET_LIVE_GROUP_SHARE_SPEC.md",
    "FLEET_SYNC_HEALTH_ADMIN_TODO.md",
    "FOTAWEB_SIMCONTROL_ASSIGNMENT_CONFIRM_TODO.md",
    "FUNCTION_URL_ZERO_INVOKE_TODO.md",
    "GSC_DOMAIN_TXT_TOKENS_2026-08-02.md",
    "LAST_KNOWN_LOCATION_AND_LAST_SEEN_SPEC.md",
    "MOTION_ALERT_EPISODE_DWELL_BACKOFF_SPEC.md",
    "MOTION_ALERT_RIDE_LATCH_SPEC.md",
    "ORG_SCOPED_DEVICES_HANDOVER.md",
    "PAIRING_LOOKUP_HARDENING_TODO.md",
    "PET_SOFT_ARCHIVE_AND_GCP_CREDS_SPEC.md",
    "PIETER_3BO_MOBI_USER_MANUAL_PAGE.md",
    "POPIA_IMEI_LOGS_RETENTION_COUNSEL_NOTE.md",
    "SHOP_CURRENCY_PAYFAST_ADVISORY_2026-08-11.md",
    "SIMCONTROL_ADMIN_INTEGRATION_TODO.md",
    "TODO_start_odt_mode_refactor.md",
    "USER_ACTIONS_SEO_HOSTING.md",
    "USER_ASSET_CONTINUITY_AND_OFFLINE_ALERTS_SPEC.md",
    "USER_DEVICE_BIKE_ASSOCIATION_TODO.md",
    "WA_PAIRING_ONBOARD_CLIENT_NAMEERROR_SPEC.md",
    "WEB_VISUAL_BRAND_DARKMODE_AUDIT_SPEC.md",
    "cfg_device_assignment_SPEC.md",
    "emergency_ff_location_pin_SPEC.md",
    "escalation_share_portal_crash_ci_SPEC.md",
    "extend_on_avl_tmt250_SPEC.md",
    "extend_wa_defer_24h_SPEC.md",
    "fleet_guest_access_deprecation_TODO.md",
    "fleet_map_pin_popup_SPEC.md",
    "live_tracker_map_perf_SPEC.md",
    "live_tracker_navigate_whatsapp_v5_SPEC.md",
    "movement_auto_odt_and_status_dump_BUGFIX_2026-08-03.md",
    "odt_skip_non_odt_devices_SPEC.md",
    "remove_open_map_button_TODO.md",
    "seo_3bo_mobi_AUDIT.md",
    "share_ride_safe_and_sound_SPEC.md",
    "site_consolidation_3bo_SPEC.md",
    "stop_tracking_confirmation_SPEC.md",
    "tmt250_bench_load_candidate_TODO.md",
    "viewer_datetime_instant_PHASE_C_TODO.md",
    "viewer_datetime_instant_SPEC.md",
    "whatsapp_hybrid_revisions_and_extend.plan.md",
    "whatsapp_hybrid_revisions_and_extend_SPEC.md",
    "www_3bo_mobi_SEO_MAXIMIZE_SPEC.md",
]

RELOCATE_MAP = {
    "docs/plans/IDENTITY_AND_ACCESS_PERSONAS.md": "docs/architecture/IDENTITY_AND_ACCESS_PERSONAS.md",
    "docs/plans/ORG_HUB_IDENTITY_AND_ACCESS_SPEC.md": "docs/architecture/ORG_HUB_IDENTITY_AND_ACCESS_SPEC.md",
    "docs/plans/ORG_SCOPED_ACCESS_PERMISSION_MATRIX.md": "docs/architecture/ORG_SCOPED_ACCESS_PERMISSION_MATRIX.md",
    "docs/plans/WHATSAPP_FEATURE_INVARIANTS.md": "docs/architecture/WHATSAPP_FEATURE_INVARIANTS.md",
    "docs/plans/BIKE_B2B_WWW_CONTENT_AUDIT_2026-08-09.md": "docs/operations/learnings/BIKE_B2B_WWW_CONTENT_AUDIT_2026-08-09.md",
    "docs/plans/FLEET_MAP_PIN_POPUP_LEARNINGS_2026-08-09.md": "docs/operations/learnings/FLEET_MAP_PIN_POPUP_LEARNINGS_2026-08-09.md",
    "docs/plans/SHOP_SEO_AUDIT_2026-08-11.md": "docs/operations/learnings/SHOP_SEO_AUDIT_2026-08-11.md",
    "docs/plans/SIMULATOR_COPY_AUDIT_2026-08-11.md": "docs/operations/learnings/SIMULATOR_COPY_AUDIT_2026-08-11.md",
    "docs/plans/WEB_PROPERTIES_LEARNINGS_2026-08-01.md": "docs/operations/learnings/WEB_PROPERTIES_LEARNINGS_2026-08-01.md",
    "docs/plans/GCP_OAUTH_ADMIN_SETUP.md": "docs/operations/GCP_OAUTH_ADMIN_SETUP.md",
    "docs/plans/METABASE_OCI_NGINX_LE_RUNBOOK_2026-08-02.md": "docs/operations/METABASE_OCI_NGINX_LE_RUNBOOK_2026-08-02.md",
    "docs/plans/MICROSOFT_OAUTH_ADMIN_SETUP.md": "docs/operations/MICROSOFT_OAUTH_ADMIN_SETUP.md",
    "docs/plans/xneelo_3bo_mobi_RUNBOOK.md": "docs/operations/xneelo_3bo_mobi_RUNBOOK.md",
}


def _iter_markdown(repo_root: Path):
    for path in repo_root.rglob("*.md"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        yield path


def _link_replacements(old_rel: str, new_rel: str) -> list[tuple[str, str]]:
    old_posix = old_rel.replace("\\", "/")
    new_posix = new_rel.replace("\\", "/")
    basename = Path(old_posix).name
    pairs: list[tuple[str, str]] = [
        (old_posix, new_posix),
        (f"plans/{basename}", f"plans/{Path(new_posix).as_posix().split('plans/', 1)[-1]}"),
        (f"./{basename}", f"./{Path(new_posix).name}"),
    ]
    if "archive/" in new_posix:
        pairs.append((f"./{basename}", f"./archive/{basename}"))
    if "architecture/" in new_posix:
        pairs.append((f"./{basename}", f"../architecture/{basename}"))
    if "operations/" in new_posix and "learnings" in new_posix:
        pairs.append((f"./{basename}", f"../operations/learnings/{basename}"))
    if "operations/" in new_posix and "learnings" not in new_posix:
        pairs.append((f"./{basename}", f"../operations/{basename}"))
    # Deduplicate preserving order
    seen = set()
    out: list[tuple[str, str]] = []
    for a, b in pairs:
        if a not in seen:
            seen.add(a)
            out.append((a, b))
    return out


def apply_link_fixes(repo_root: Path, moves: dict[str, str], dry_run: bool) -> int:
    """moves: old_rel -> new_rel relative to repo root."""
    all_pairs: list[tuple[str, str]] = []
    for old, new in moves.items():
        all_pairs.extend(_link_replacements(old, new))

    changed_files = 0
    for md in _iter_markdown(repo_root):
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        original = text
        for old, new in all_pairs:
            text = text.replace(old, new)
        if text != original:
            changed_files += 1
            if not dry_run:
                md.write_text(text, encoding="utf-8")
    return changed_files


def archive_batch(repo_root: Path, dry_run: bool) -> dict[str, list[str]]:
    plans = repo_root / "docs" / "plans"
    archive = plans / "archive"
    log: dict[str, list[str]] = {"moved": [], "deleted_duplicate": [], "skipped": []}

    archive.mkdir(parents=True, exist_ok=True)

    for name in sorted(ARCHIVE_DUPLICATE_DELETE):
        active = plans / name
        archived = archive / name
        if active.is_file() and archived.is_file():
            log["deleted_duplicate"].append(name)
            if not dry_run:
                active.unlink()
        elif active.is_file():
            log["skipped"].append(f"duplicate-missing-archive:{name}")

    move_set = set(ARCHIVE_MOVE) - ARCHIVE_HOLD - ARCHIVE_DUPLICATE_DELETE
    moves: dict[str, str] = {}

    for name in sorted(move_set):
        if name in ARCHIVE_HOLD:
            continue
        active = plans / name
        dest = archive / name
        if not active.is_file():
            continue
        if dest.is_file():
            log["deleted_duplicate"].append(name)
            if not dry_run:
                active.unlink()
            continue
        rel_old = f"docs/plans/{name}"
        rel_new = f"docs/plans/archive/{name}"
        moves[rel_old] = rel_new
        log["moved"].append(name)
        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            active.replace(dest)

    if moves:
        n = apply_link_fixes(repo_root, moves, dry_run)
        log.setdefault("link_files_changed", [str(n)])

    return log


def relocate_batch(repo_root: Path, dry_run: bool) -> dict[str, list[str]]:
    log: dict[str, list[str]] = {"moved": [], "skipped": []}
    moves: dict[str, str] = {}

    for old_rel, new_rel in RELOCATE_MAP.items():
        src = repo_root / old_rel
        dst = repo_root / new_rel
        if not src.is_file():
            log["skipped"].append(f"missing:{old_rel}")
            continue
        log["moved"].append(f"{old_rel} -> {new_rel}")
        moves[old_rel] = new_rel
        if not dry_run:
            dst.parent.mkdir(parents=True, exist_ok=True)
            src.replace(dst)

    if moves:
        n = apply_link_fixes(repo_root, moves, dry_run)
        log.setdefault("link_files_changed", [str(n)])

    return log


def auto_archive_batch(repo_root: Path, dry_run: bool) -> dict[str, list[str]]:
    """Move active plans with status implemented|superseded|cancelled and evidence set."""
    from plans_registry.lib import parse_frontmatter, render_frontmatter

    plans = repo_root / "docs" / "plans"
    archive = plans / "archive"
    log: dict[str, list[str]] = {
        "moved": [],
        "skipped_hold": [],
        "skipped_no_evidence": [],
        "skipped_status": [],
    }
    moves: dict[str, str] = {}

    for path in sorted(plans.glob("*.md")):
        name = path.name
        if name.startswith("PLANS_") or name == "RELOCATION_MAP.md":
            continue
        text = path.read_text(encoding="utf-8")
        fm, _body = parse_frontmatter(text)
        if not fm:
            continue
        status = str(fm.get("status", ""))
        if name in ARCHIVE_HOLD:
            log["skipped_hold"].append(name)
            continue
        if status not in AUTO_ARCHIVE_STATUSES:
            log["skipped_status"].append(f"{name}:{status}")
            continue
        if not evidence_set(fm.get("evidence")):
            log["skipped_no_evidence"].append(name)
            continue
        dest = archive / name
        if dest.is_file():
            log.setdefault("deleted_duplicate", []).append(name)
            if not dry_run:
                path.unlink()
            continue
        rel_old = f"docs/plans/{name}"
        rel_new = f"docs/plans/archive/{name}"
        moves[rel_old] = rel_new
        log["moved"].append(name)
        if not dry_run:
            fm["archived_date"] = date.today().isoformat()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(render_frontmatter(fm) + _body, encoding="utf-8")
            path.unlink()

    if moves:
        n = apply_link_fixes(repo_root, moves, dry_run)
        log.setdefault("link_files_changed", [str(n)])

    return log


def append_archive_readme(repo_root: Path, dry_run: bool) -> None:
    readme = repo_root / "docs" / "plans" / "archive" / "README.md"
    if not readme.is_file():
        return
    stamp = date.today().isoformat()
    note = (
        f"\n\n## Bulk archive {stamp}\n\n"
        "Agent `/plans-audit` batch: completed plans moved from active `docs/plans/` "
        "(no stubs). Canonical reference relocated to `docs/architecture/`; "
        "learnings to `docs/operations/learnings/`; runbooks to `docs/operations/`. "
        "See `PLANS_INDEX.md` for the active queue.\n"
    )
    text = readme.read_text(encoding="utf-8")
    if f"Bulk archive {stamp}" in text:
        return
    if not dry_run:
        readme.write_text(text + note, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch archive/relocate plans")
    parser.add_argument(
        "action",
        choices=["archive", "relocate", "all", "auto-archive"],
    )
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    repo = args.repo_root.resolve()
    if args.action == "auto-archive":
        result = auto_archive_batch(repo, args.dry_run)
        print("AUTO-ARCHIVE:", result)
        if not args.dry_run and result.get("moved"):
            append_archive_readme(repo, False)
        return 0
    if args.action in ("archive", "all"):
        result = archive_batch(repo, args.dry_run)
        print("ARCHIVE:", result)
        if not args.dry_run:
            append_archive_readme(repo, False)
    if args.action in ("relocate", "all"):
        result = relocate_batch(repo, args.dry_run)
        print("RELOCATE:", result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
