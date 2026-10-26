#!/usr/bin/env python3
"""Cursor hook: remind agent to update plans registry when touching docs/plans.

Canonical copy: bike-tracker/.cursor/hooks/ (git). Mirror to umbrella
Documents/3bo/.cursor/hooks/ for multi-repo sessions.

Exit 0 always (fail-open). Prints JSON followup on `stop` when needed.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PLAN_PATH_RE = re.compile(
    r"(?:docs[/\\]plans[/\\][^\s\"'<>|]+?\.md)",
    re.IGNORECASE,
)

# Generated reports — touching these alone is not "plan work"
IGNORE_PLAN_SUFFIXES = (
    "PLANS_INDEX.md",
    "PLANS_AUDIT_REPORT.md",
    "RELOCATION_MAP.md",
)

MAX_FOLLOWUP_LOOPS = 1

REGISTRY_PATHS = (
    "docs/plans/PLANS_INDEX.md",
    "docs/plans/PLANS_AUDIT_REPORT.md",
    "docs/plans/RELOCATION_MAP.md",
    "docs/plans/archive/",
)


def _read_stdin_json() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _transcript_text(transcript_path: str | None) -> str:
    if not transcript_path:
        return ""
    path = Path(transcript_path)
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _plan_paths_in_transcript(text: str) -> list[str]:
    if not text:
        return []
    hits: list[str] = []
    for match in PLAN_PATH_RE.finditer(text):
        p = match.group(0).replace("\\", "/")
        if any(p.endswith(s) for s in IGNORE_PLAN_SUFFIXES):
            continue
        if "/archive/" in p.lower() and p.count("/") <= 3:
            continue
        hits.append(p)
    seen = set()
    out = []
    for h in hits:
        if h not in seen:
            seen.add(h)
            out.append(h)
    return out[:12]


def _is_valid_git_root(path: Path) -> bool:
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=str(path),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        return proc.returncode == 0 and (proc.stdout or "").strip() == "true"
    except (OSError, subprocess.TimeoutExpired):
        return False


def _git_roots(workspace_roots: list[str]) -> list[Path]:
    roots: list[Path] = []
    for wr in workspace_roots or []:
        base = Path(wr)
        if not base.is_dir():
            continue
        for child in sorted(base.iterdir()):
            if not child.is_dir():
                continue
            if (child / ".git").exists() and _is_valid_git_root(child):
                roots.append(child.resolve())
        if (base / ".git").exists() and _is_valid_git_root(base):
            roots.append(base.resolve())
    seen = set()
    unique: list[Path] = []
    for r in roots:
        key = str(r)
        if key not in seen:
            seen.add(key)
            unique.append(r)
    return unique


def _repos_for_plans(text: str, git_roots: list[Path]) -> list[Path]:
    if not text or not git_roots:
        return []
    mentioned: list[Path] = []
    for root in git_roots:
        name = root.name
        if re.search(
            rf"(?:[/\\]){re.escape(name)}(?:[/\\]|\"|'|\s|$)",
            text,
            re.IGNORECASE,
        ):
            mentioned.append(root)
        elif "docs/plans/" in text and (root / "docs" / "plans").exists():
            mentioned.append(root)
    return mentioned


def _run_git(args: list[str], cwd: Path) -> str:
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        return (proc.stdout or "") + (proc.stderr or "")
    except (OSError, subprocess.TimeoutExpired):
        return ""


def _registry_touched(repo_root: Path) -> dict:
    rels = list(REGISTRY_PATHS)
    # Any plan file under docs/plans
    porcelain = _run_git(["status", "--porcelain", "docs/plans"], repo_root).strip()
    lines = porcelain.splitlines()
    plan_touched = any(
        ln for ln in lines
        if "docs/plans" in ln
        and "PLANS_INDEX.md" not in ln
        and "PLANS_AUDIT_REPORT.md" not in ln
        and "RELOCATION_MAP.md" not in ln
    )
    index_dirty = any("PLANS_INDEX.md" in ln for ln in lines)
    archive_dirty = any("archive" in ln for ln in lines)
    return {
        "repo": repo_root.name,
        "any_plans_dirty": bool(lines),
        "plan_content_dirty": plan_touched,
        "index_dirty": index_dirty,
        "archive_dirty": archive_dirty,
        "porcelain_sample": lines[:5],
    }


def _needs_reminder(plan_hits: list[str], statuses: list[dict]) -> bool:
    if not plan_hits:
        return False
    for st in statuses:
        if st["plan_content_dirty"] or st["archive_dirty"]:
            if not st["index_dirty"]:
                return True
    return False


def _build_followup(plan_hits: list[str], statuses: list[dict]) -> str:
    lines = [
        "Session audit: this conversation referenced `docs/plans/` files but "
        "the plans registry was not fully updated.",
        "",
        "Before ending the session:",
        "1. Update YAML frontmatter (`status`, `updated`, `evidence`) on touched plans.",
        "2. Run `python scripts/ops/refresh_plans_index.py --write`.",
        "3. If completed: `git mv` to `docs/plans/archive/`, fix inbound links, "
        "run `/doc-kb-save` for archived paths.",
        "",
        "Plan paths seen in transcript:",
    ]
    for p in plan_hits[:8]:
        lines.append(f"- {p}")
    lines.append("")
    lines.append("Registry status by repo:")
    for st in statuses:
        lines.append(
            f"- {st['repo']}: plan_dirty={st['plan_content_dirty']} "
            f"index_dirty={st['index_dirty']} archive_dirty={st['archive_dirty']}"
        )
    lines.append("")
    lines.append(
        "Skill: `/plans-audit` · Spec: `docs/plans/PLANS_WORK_REGISTRY_SPEC.md`"
    )
    return "\n".join(lines)


def main() -> int:
    payload = _read_stdin_json()
    event = payload.get("hook_event_name") or ""
    loop_count = int(payload.get("loop_count") or 0)
    status = payload.get("status") or "completed"
    workspace_roots = payload.get("workspace_roots") or []
    transcript_path = payload.get("transcript_path")

    transcript = _transcript_text(transcript_path)
    plan_hits = _plan_paths_in_transcript(transcript)

    git_roots = _git_roots(workspace_roots)
    audit_roots = _repos_for_plans(transcript, git_roots) or git_roots
    statuses = [_registry_touched(r) for r in audit_roots if (r / "docs" / "plans").is_dir()]

    need = _needs_reminder(plan_hits, statuses)

    audit_msg = (
        f"[plans-registry-audit] {datetime.now(timezone.utc).isoformat()} "
        f"event={event} plan_hits={len(plan_hits)} need_reminder={need} "
        f"repos={[s['repo'] for s in statuses]}"
    )
    print(audit_msg, file=sys.stderr)

    if event == "sessionEnd":
        print("{}")
        return 0

    if event != "stop" or status != "completed":
        print("{}")
        return 0

    if loop_count >= MAX_FOLLOWUP_LOOPS:
        print("{}")
        return 0

    if not need:
        print("{}")
        return 0

    print(json.dumps({"followup_message": _build_followup(plan_hits, statuses)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
