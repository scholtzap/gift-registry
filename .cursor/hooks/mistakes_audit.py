#!/usr/bin/env python3
"""
Mistakes-log audit hook -- gift-registry (Gift Circles).

Cursor: wire on `stop` (returns followup_message) and `sessionEnd` (stderr audit only).
Claude Code: wire on `Stop` via .claude/settings.local.json (returns decision=block).

Scans the conversation transcript for deploy/ops/secrets/verification failures and
reminds the agent to append a dated entry to git-root MISTAKES.md when the file was not
touched. Fail-open: always exits 0, prints `{}` unless a reminder is warranted.

Pattern split (doc-kb-setup Phase 15):
  GENERIC_FAILURE_RE  -- repo-agnostic deploy / auth / committed-secret signals
  REPO_FAILURE_RE     -- this stack: Next.js + TypeScript, Postgres + Prisma,
                        WhatsApp Cloud API webhooks, Meta Model API, ffmpeg audio ingest,
                        this repo's two GitHub Actions workflows
  FALSE_POSITIVE_RE   -- benign lines that merely mention failure/error
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Generic signals -- reusable across repos
# ---------------------------------------------------------------------------
GENERIC_FAILURE_RE = re.compile(
    r"(?:"
    r"UPDATE_ROLLBACK|"
    r"failed to deploy|"
    r"Deploy failed|"
    r"Service deployment failed|"
    r"deployment failed|"
    r"Stack update failed|"
    r"403 Forbidden[^\n]{0,80}(?:permission|auth|access)|"
    r"Missing Authentication Token|"
    r"UNAUTHENTICATED|"
    r"PermissionDenied|"
    r"AccessDenied|"
    r"secret[^\n]{0,40}committ?ed|"
    r"credential[^\n]{0,40}committ?ed|"
    r"token[^\n]{0,40}committ?ed|"
    r"gitleaks[^\n]{0,60}(?:found|leak|detected)"
    r")",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# gift-registry-specific signals
# ---------------------------------------------------------------------------
REPO_FAILURE_RE = re.compile(
    r"(?:"
    # ---- Next.js / TypeScript ----
    r"TS\d{4}:[^\n]{0,120}|"
    r"Type (?:error|check)[^\n]{0,60}(?:failed|error)|"
    r"tsc[^\n]{0,40}(?:failed|exit code [^0\s])|"
    r"(?:next )?build[^\n]{0,40}(?:failed|error)|"
    r"npm (?:run )?(?:build|dev|start)[^\n]{0,40}(?:failed|error)|"
    r"pnpm (?:build|dev)[^\n]{0,40}(?:failed|error)|"
    r"Module not found: Can't resolve|"
    r"Unhandled Runtime Error|"
    r"Hydration (?:error|mismatch|failed)|"
    r"(?:Server Action|Route Handler)[^\n]{0,60}(?:failed|error)|"
    r"(?:500 Internal Server Error|502 Bad Gateway|503 Service Unavailable)[^\n]{0,60}|"
    r"(?:app/api)[^\n]{0,80}(?:405|not allowed|no route|Unhandled)|"
    # ---- Postgres / Prisma ----
    r"PrismaClient(?:KnownRequest|ValidationError|Initialization)Error|"
    r"P20(?:02|03|05|25)[^\n]{0,80}|"
    r"prisma (?:migrate|db push|generate|studio)[^\n]{0,60}(?:failed|error|drift)|"
    r"Drift detected|migration[^\n]{0,60}(?:failed|out of order|not applied)|"
    r"(?:relation|table|column)[^\n]{0,60}does not exist|"
    r"Error querying the database:|"
    r"violates foreign key constraint|violates unique constraint|"
    r"Timed out fetching a new connection|pool timeout|"
    r"ECONNREFUSED[^\n]{0,40}(?:5432|postgres)|"
    r"(?:DATABASE_URL|POSTGRES)[^\n]{0,40}(?:missing|unset|required)|"
    # ---- WhatsApp Cloud API / webhooks ----
    r"(?:graph\.facebook\.com|Graph API)[^\n]{0,120}(?:error|failed|400|401|403|429)|"
    r"X-Hub-Signature-256[^\n]{0,80}(?:invalid|mismatch|fail|missing)|"
    r"(?:webhook|hub\.challenge)[^\n]{0,60}(?:verify|verification|validation)[^\n]{0,20}(?:fail|error)|"
    r"(?:callback URL|webhook URL)[^\n]{0,60}(?:failed|unreachable|not responding)|"
    r"(?:error_code|error code)[^\n]{0,20}1310(?:10|20|26|49|57)|"
    r"(?:media|attachment)[^\n]{0,60}(?:expired|not found|410)|"
    r"(?:template|HSM)[^\n]{0,60}(?:rejected|not approved|REJECTED|failed review)|"
    r"(?:24[ -]hour|customer service window)[^\n]{0,80}(?:expired|closed|outside)|"
    r"(?:reclassif|category)[^\n]{0,40}MARKETING|"
    r"(?:messaging limit|rate limit)[^\n]{0,60}(?:250|reached|exceeded|throttl)|"
    r"(?:WhatsApp|WABA)[^\n]{0,60}(?:not verified|unverified|sandbox|test number)[^\n]{0,40}(?:fail|blocked|error)|"
    r"(?:BSUID|Business-Scoped User)[^\n]{0,60}(?:missing|null|not sent)|"
    r"(?:Send To|allow.?list)[^\n]{0,60}(?:not (?:in|on)|missing|blocked)|"
    # ---- Meta Model API ----
    r"api\.meta\.ai[^\n]{0,120}(?:error|400|401|403|429|5\d\d|timeout)|"
    r"(?:MODEL_API_KEY|LLM_)[^\n]{0,40}(?:missing|not set|unset|required|invalid)|"
    r"(?:muse|sam-3\.1|muse-wonder|muse-spark|muse-image)[^\n]{0,60}(?:not found|unsupported|unavailable|overloaded|degraded|429|rate limit)|"
    r"HTTP 400[^\n]{0,80}(?:schema|json_schema|recursive|invalid)|"
    r"(?:response_format|json_schema|text\.format)[^\n]{0,80}(?:400|invalid|rejected|failed)|"
    r"x-ratelimit[^\n]{0,60}(?:exceeded|remaining[^\n]{0,10}0)|"
    r"(?:web_search|search grounding)[^\n]{0,60}(?:unavailable|not supported|unsupported|disabled|blocked)|"
    r"(?:credits?|billing|spend limit)[^\n]{0,60}(?:required|exhausted|insufficient|not applied|no card)|"
    # ---- Voice-note ingest (ffmpeg) ----
    r"ffmpeg[^\n]{0,80}(?:failed|error|invalid|No such|not found)|"
    r"(?:ogg|opus)[^\n]{0,60}(?:unsupported|invalid|cannot decode|decode fail)|"
    # ---- demo-day tunnel ----
    r"(?:ngrok|cloudflare tunnel|localhost.run|serveo)[^\n]{0,60}(?:error|failed|down|404|tunnel not)|"
    # ---- this repo's CI + docs sync ----
    r"GitHub Actions[^\n]{0,80}(?:failed|failure|error)|"
    r"workflow[^\n]{0,60}(?:failed|failure)|"
    r"sync-notion-docs[^\n]{0,60}(?:failed|failure)|"
    r"plans-registry-gate[^\n]{0,60}(?:failed|failure)|"
    r"Process completed with exit code [^0\s]|"
    r"sync_docs_to_notion[^\n]{0,80}(?:failed|error|abort)|"
    r"Notion[^\n]{0,80}(?:401|403|404|rate.?limit|failed|error)|"
    r"PLANS_INDEX[^\n]{0,60}(?:stale|out of date)|"
    r"pre-commit[^\n]{0,60}(?:failed|blocked)|"
    # ---- Google Drive for Desktop reverts (this folder is synced) ----
    r"(?:revert|restore|rolled back)[^\n]{0,40}(?:AGENTS\.md|\.pre-commit-config|hooks\.json|on disk)|"
    r"reparse.?point[^\n]{0,60}(?:failed|error)|"
    r"file[^\n]{0,40}(?:locked|in use)[^\n]{0,40}(?:write|save)"
    r")",
    re.IGNORECASE,
)

# Benign lines that merely mention failure/error and are not ops mistakes.
FALSE_POSITIVE_RE = re.compile(
    r"(?:"
    r"pytest|test_.*failed|lint.?fail|AssertionError|"
    r"Monitored .* failed|pattern did NOT match|did not match the regex|"
    r"notify_on_output|\"pattern\":|FALSE_POSITIVE_RE|GENERIC_FAILURE_RE|REPO_FAILURE_RE|"
    r"do not treat as live|awaiting prod|not implemented|"
    r"hypothetical|for example|e\.g\.|TODO|FIXME|"
    r"if .*KeyError|except \w*(?:Error|Exception)|raise \w*Error|"
    r"MISTAKES\.md|mistakes_audit\.py|UNVERIFIED|"
    r"failure criteria|failure mode|error handling|error boundary|"
    # Product/ops Q&A that embeds gate language on the same JSONL line as the answer opener
    # (reminder snippets show the first 160 chars, so they look like the hit).
    r"No usable WhatsApp/Meta MCP|"
    r"OTP is not required for the demo|"
    r"circle link was always the primary door|"
    r"Stopped\. Live OTP|"
    r"all three WhatsApp runtime values are missing|"
    r"Do not invent (?:IDs|Meta MCP)|"
    r"Session audit: deploy/ops/secrets/verification failures were detected"
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


def _read_payload() -> dict:
    """Cursor on Windows sometimes leaves stdin empty and omits workspace_roots.

    Fall back to an argv temp file (if present) and CURSOR_* / CLAUDE_* env vars.
    """
    payload = _read_stdin_json()
    if not payload and len(sys.argv) > 1:
        candidate = Path(sys.argv[1])
        if candidate.is_file():
            try:
                payload = json.loads(candidate.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                payload = {}

    if not payload.get("workspace_roots"):
        for key in ("CURSOR_PROJECT_DIR", "CLAUDE_PROJECT_DIR"):
            val = (os.environ.get(key) or "").strip()
            if val:
                payload["workspace_roots"] = [val]
                break

    if not payload.get("transcript_path"):
        tp = (os.environ.get("CURSOR_TRANSCRIPT_PATH") or "").strip()
        if tp:
            payload["transcript_path"] = tp

    if not payload.get("hook_event_name"):
        for key in ("CURSOR_HOOK_EVENT_NAME", "CLAUDE_HOOK_EVENT_NAME"):
            val = (os.environ.get(key) or "").strip()
            if val:
                payload["hook_event_name"] = val
                break

    return payload


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


def _deploy_failures_in_transcript(text: str) -> list[str]:
    if not text:
        return []
    hits: list[str] = []
    for line in text.splitlines():
        if FALSE_POSITIVE_RE.search(line):
            continue
        if GENERIC_FAILURE_RE.search(line) or REPO_FAILURE_RE.search(line):
            snippet = line.strip()
            if len(snippet) > 160:
                snippet = snippet[:157] + "..."
            hits.append(snippet)
    seen: set[str] = set()
    out: list[str] = []
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
    """Single-repo workspaces (root IS the git repo) and umbrella workspaces
    (root contains git sub-repos as immediate children) both resolve."""
    roots: list[Path] = []
    for wr in workspace_roots or []:
        base = Path(wr)
        if not base.is_dir():
            continue
        if (base / ".git").exists() and _is_valid_git_root(base):
            roots.append(base.resolve())
        else:
            for child in sorted(base.iterdir()):
                if child.is_dir() and (child / ".git").exists() and _is_valid_git_root(child):
                    roots.append(child.resolve())
    seen: set[str] = set()
    unique: list[Path] = []
    for r in roots:
        key = str(r)
        if key not in seen:
            seen.add(key)
            unique.append(r)
    return unique


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


def _mistakes_status(repo_root: Path, transcript_path: str | None = None) -> dict:
    mistakes = repo_root / "MISTAKES.md"
    # Untracked files (fresh repo, pre-first-commit) still show in --porcelain.
    porcelain = _run_git(["status", "--porcelain", "MISTAKES.md"], repo_root).strip()
    exists = mistakes.is_file()
    # A committed log is also "touched": the hygiene rule requires committing the doc,
    # so accepting only a dirty file makes the two hooks contradict forever. A commit
    # counts when it landed after this session's transcript file was created.
    # Also count a same-UTC-day commit: Cursor follow-up turns reset loop_count to 0 and
    # often omit/skew transcript birthtime on Windows, which re-prompted forever after a
    # clean commit of MISTAKES.md (2026-11-04 gifts-registry session).
    committed_this_session = False
    committed_today = False
    latest_raw = ""
    if exists:
        latest_raw = _run_git(
            ["log", "-1", "--format=%ct", "--", "MISTAKES.md"], repo_root
        ).strip()
        try:
            if latest_raw:
                latest_ts = int(latest_raw.splitlines()[-1].strip())
                now = datetime.now(timezone.utc)
                committed_today = datetime.fromtimestamp(latest_ts, timezone.utc).date() == now.date()
                if transcript_path:
                    stat = Path(transcript_path).stat()
                    started = getattr(stat, "st_birthtime", stat.st_ctime)
                    committed_this_session = latest_ts >= int(started)
        except (OSError, ValueError):
            committed_this_session = False
            committed_today = False
    touched = bool(porcelain) or committed_this_session or committed_today
    if not exists:
        state = "missing"
    elif touched:
        state = "dirty"
    else:
        state = "clean"
    return {
        "repo": repo_root.name,
        "path": str(mistakes),
        "exists": exists,
        "touched": touched,
        "state": state,
    }


def _build_reminder(deploy_hits: list[str], statuses: list[dict]) -> str:
    repos_need_log = [s for s in statuses if not s["touched"]]
    lines = [
        "Session audit: deploy/ops/secrets/verification failures were detected in this "
        "conversation, but MISTAKES.md was not updated in the repo(s) you touched.",
        "",
        "Before ending the session:",
        "1. Append a dated entry to MISTAKES.md at the git root of each repo you touched "
        "(newest first, no secrets). Create the file if missing.",
        "2. Commit the doc -- CI owns the Notion sync "
        "(.github/workflows/sync-notion-docs.yml). Do NOT run /doc-kb-save by hand.",
        "",
        "Failure signals seen:",
    ]
    for hit in deploy_hits[:5]:
        lines.append(f"- {hit}")
    lines.append("")
    if repos_need_log:
        lines.append("Repos still needing MISTAKES.md:")
        for s in repos_need_log:
            lines.append(f"- {s['repo']}: {s['state']} ({s['path']})")
        lines.append("")
    lines.append(
        "Template: `## YYYY-MM-DD -- title` then What happened / Impact / Fix / Do not repeat."
    )
    return "\n".join(lines)


def main() -> int:
    payload = _read_payload()
    raw_event = payload.get("hook_event_name") or ""
    event = raw_event.lower()
    loop_count = int(payload.get("loop_count") or 0)
    status = payload.get("status") or "completed"
    transcript_path = payload.get("transcript_path")

    # Cursor sends workspace_roots (list); Claude Code sends workspace_root / cwd (string).
    workspace_roots: list[str] = list(payload.get("workspace_roots") or [])
    for key in ("workspace_root", "cwd"):
        val = payload.get(key) or ""
        if val and val not in workspace_roots:
            workspace_roots.append(val)

    # Output shape depends on the caller: Cursor uses lowercase "stop", Claude Code "Stop".
    is_claude_code = raw_event == "Stop"

    transcript = _transcript_text(transcript_path)
    deploy_hits = _deploy_failures_in_transcript(transcript)

    if not deploy_hits:
        if event == "sessionend":
            print(
                "[mistakes-audit] %s no session failure signals in transcript"
                % datetime.now(timezone.utc).isoformat(),
                file=sys.stderr,
            )
        print("{}")
        return 0

    git_roots = _git_roots(workspace_roots)
    statuses = [_mistakes_status(r, transcript_path) for r in git_roots] if git_roots else []
    # Empty statuses means we could not resolve a git root (Windows payload gaps).
    # Fail open: do not nag when we cannot prove the log is missing.
    all_logged = (not statuses) or all(s["touched"] for s in statuses)

    print(
        "[mistakes-audit] %s event=%s hits=%s logged=%s repos=%s roots=%s"
        % (
            datetime.now(timezone.utc).isoformat(),
            raw_event,
            len(deploy_hits),
            all_logged,
            [s["repo"] for s in statuses],
            len(git_roots),
        ),
        file=sys.stderr,
    )

    need_reminder = bool(deploy_hits) and not all_logged

    if event == "sessionend":
        if need_reminder:
            print(
                "[mistakes-audit] MISTAKES.md not updated -- sessionEnd is audit-only",
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

    reminder = _build_reminder(deploy_hits, statuses)

    if is_claude_code:
        print(json.dumps({"decision": "block", "reason": reminder}))
    else:
        print(json.dumps({"followup_message": reminder}))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
