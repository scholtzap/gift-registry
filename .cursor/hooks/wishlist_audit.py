#!/usr/bin/env python3
"""Cursor hook: remind the agent to update WISHLIST.md after discovery-tax / tooling gaps.

Uses the conversation transcript (JSONL) plus git status on each workspace git
root. Wired on `stop` (returns followup_message) and `sessionEnd` (stderr audit
only — sessionEnd responses are not consumed by Cursor).

Exit 0 always (fail-open). Prints JSON to stdout only on `stop` when a reminder
is needed.

Canonical copy: bike-tracker/.cursor/hooks/ (git). Umbrella workspace
`Documents/3bo/.cursor/hooks/` should mirror this folder for multi-repo sessions.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Tooling gaps + discovery tax (transcript JSONL).
WISHLIST_SIGNAL_RE = re.compile(
    r"(?:"
    r"had to (?:search|grep|glob|explore|scan|browse) (?:the )?(?:whole |entire )?"
    r"(?:codebase|repo|tree|console|AWS|Mongo)"
    r"|could not find (?:where|docs?|documentation|runbook|the (?:path|collection|route))"
    r"|no ARCHITECTURE\.md"
    r"|ARCHITECTURE\.md (?:is )?(?:missing|a stub|stale)"
    r"|spent (?:too many |a lot of )?tokens (?:searching|exploring|grepping)"
    r"|missing (?:MCP|CLI|skill|credential scope|GitHub secret)"
    r"|MCP (?:not configured|unavailable|needsAuth|needs auth)"
    r"|would help (?:future|other|the next) agents?"
    r"|repeated(?:ly)? (?:had to|needed to) (?:look up|search|explore|grep)"
    r"|undocumented (?:deploy|route|collection|host|layout)"
    r"|I (?:don't|do not) know where .{0,80}(?:lives|is documented)"
    r"|quick ?ref(?:erence)? (?:would|should) (?:help|avoid)"
    r")",
    re.IGNORECASE,
)

FALSE_POSITIVE_RE = re.compile(
    r"(?:"
    r"pytest|test_.*failed|lint failed|AssertionError|"
    r"Monitored .* failed|pattern did NOT match|"
    r"notify_on_output|\"pattern\":|"
    r"Do not append when|not a human task list|"
    r"WISHLIST\.md header|skill `repo-wishlist`"
    r")",
    re.IGNORECASE,
)

MAX_FOLLOWUP_LOOPS = 1


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


def _signals_in_transcript(text: str) -> list[str]:
    if not text:
        return []
    hits: list[str] = []
    for line in text.splitlines():
        if FALSE_POSITIVE_RE.search(line):
            continue
        if WISHLIST_SIGNAL_RE.search(line):
            snippet = line.strip()
            if len(snippet) > 160:
                snippet = snippet[:157] + "..."
            hits.append(snippet)
    seen = set()
    out = []
    for h in hits:
        if h not in seen:
            seen.add(h)
            out.append(h)
    return out[:8]


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


def _repos_referenced_in_transcript(text: str, git_roots: list[Path]) -> list[Path]:
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


def _wishlist_status(repo_root: Path) -> dict:
    wishlist = repo_root / "WISHLIST.md"
    rel = "WISHLIST.md"
    porcelain = _run_git(["status", "--porcelain", rel], repo_root).strip()
    exists = wishlist.is_file()
    touched = bool(porcelain)
    if not exists:
        state = "missing"
    elif touched:
        state = "dirty"
    else:
        state = "clean"
    return {
        "repo": repo_root.name,
        "path": str(wishlist),
        "exists": exists,
        "touched": touched,
        "state": state,
        "porcelain": porcelain.splitlines()[:3],
    }


def _build_followup(hits: list[str], statuses: list[dict]) -> str:
    repos_need_log = [s for s in statuses if not s["touched"]]
    lines = [
        "Session audit: exploration/tooling/discovery-tax signals were detected "
        "in this conversation transcript, but `WISHLIST.md` was not updated in "
        "the git repo(s) you touched.",
        "",
        "Before ending the session:",
        "1. Append a dated entry to each relevant git-root `WISHLIST.md` "
        "(newest first; no secrets). Create the file if missing. "
        "Kinds: tooling | access | automation | skill | quickref | inefficiency.",
        "2. If the gap is a missing pointer, prefer adding it to "
        "`ARCHITECTURE.md` in the same turn and mark the wish fulfilled.",
        "3. Cross-repo MCP/CLI/skills go in umbrella `Documents/3bo/WISHLIST.md`.",
        "",
        "Signals seen:",
    ]
    for hit in hits[:5]:
        lines.append(f"- {hit}")
    lines.append("")
    lines.append("Repos still needing WISHLIST.md:")
    for s in repos_need_log:
        lines.append(f"- {s['repo']}: {s['state']} ({s['path']})")
    lines.append("")
    lines.append(
        "Template: `## YYYY-MM-DD — title` then Kind / Requested by / Pain / "
        "What would help / Where it should live / Status: open."
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
    hits = _signals_in_transcript(transcript)
    if not hits:
        if event == "sessionEnd":
            print(
                "[wishlist-audit] %s no discovery-tax signals in transcript"
                % datetime.now(timezone.utc).isoformat(),
                file=sys.stderr,
            )
        print("{}")
        return 0

    git_roots = _git_roots(workspace_roots)
    relevant_roots = _repos_referenced_in_transcript(transcript, git_roots)
    audit_roots = relevant_roots or git_roots
    statuses = [_wishlist_status(r) for r in audit_roots]
    all_logged = bool(statuses) and all(s["touched"] for s in statuses)

    audit_msg = (
        "[wishlist-audit] %s event=%s wishlist_hits=%s wishlist_logged=%s repos=%s"
        % (
            datetime.now(timezone.utc).isoformat(),
            event,
            len(hits),
            all_logged,
            [s["repo"] for s in statuses],
        )
    )
    print(audit_msg, file=sys.stderr)

    need_reminder = bool(hits) and not all_logged

    if event == "sessionEnd":
        if need_reminder:
            print(
                "[wishlist-audit] WISHLIST.md not updated — "
                "agent should append before closing (sessionEnd is audit-only)",
                file=sys.stderr,
            )
        print("{}")
        return 0

    if event != "stop":
        print("{}")
        return 0

    if status != "completed":
        print("{}")
        return 0

    if loop_count >= MAX_FOLLOWUP_LOOPS:
        print("{}")
        return 0

    if not need_reminder:
        print("{}")
        return 0

    followup = _build_followup(hits, statuses)
    print(json.dumps({"followup_message": followup}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
