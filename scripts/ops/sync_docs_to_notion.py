"""
Sync docs/ markdown files to Notion KB using Notion's native markdown API.

GOLDEN REFERENCE COPY (doc-kb-setup skill, 2026-09-13). This is the canonical
version doc-kb-setup Phase 4 copies into a new repo -- if you improve this
script for one repo's needs, bring the improvement back here so the next
repo gets it too, instead of letting variants drift apart again.

Merged from an audit of 14 independently-evolved copies across ~20 repos
(2026-09-13). What each contributed:
  - sim_platform_integration: --file single-doc sync, the --expect-root-title
    safety guard, per-file failure isolation (one bad doc doesn't cost the
    other 67), Cloudflare-WAF-403-vs-real-403 detection with backoff
  - beach-ultimate-weather-dashboard: pretty_title()/ACRONYMS ported over
    from the Outline family, for consistent title casing on both platforms
  - production_planning's Outline script (ported to this file): request
    pacing (MIN_REQUEST_INTERVAL) so a large docs/ tree doesn't 429 partway
    through a CI run
  - production_planning + electricity_tariffs_extraction's independently
    invented "sync this repo-root file too" features, unified as
    EXTRA_SYNC_ROOT (same shape as the Outline golden script's)

Secret pattern: uses the high-entropy-only shape (sk-/AIza/BEGIN PRIVATE/
ntn_/ghp_/glpat-), NOT the broader `password\\s*=`/`api_key\\s*=` keyword
pattern several older copies still carry. metabase-3bo's own code comment
documents why: that broader pattern caused real ABORT false-positives on
docs that legitimately *mention* "password=" or "api_key=" as a variable
name in a code sample, not an actual secret. If you need to add a keyword
pattern back for a specific repo's threat model, do it as an addition on
top of this file, not by reverting to the bare keyword clauses.

Known gap NOT ported here (deliberate scope decision, not an oversight):
bike-tracker's incremental --since-commit/--since-last-success engine with a
git-diff-based cursor file and delete-propagation. Real feature for a docs/
tree large enough that a full re-sync is slow, but it adds real complexity
(cursor file, git plumbing) most repos' docs/ trees don't need yet. Layer it
on for a specific repo if its sync time actually justifies it.

2026-09-23 -- sync registry (rename-safety + deep links), ported from the
Outline sibling script's same-day fix. upsert_page()/find_child_page() match
a Notion page to a local file purely by a title computed from the filename,
with no persisted id. Renaming a source .md file changes the title the next
sync computes, misses the existing page in find_child_page()'s listing, and
CREATEs a duplicate page -- stranding the original (and any Notion comments
on it) with no error. Same root cause as the Outline incident that motivated
this there (see cable_tester_firmware's MISTAKES.md, 2026-09-23), never
actually exercised on Notion before this port, but the bug is identical:
title-only matching has no memory across a rename regardless of platform.
Fix: the sync now upserts a reserved "_Sync Registry" page directly under
NOTION_ROOT_PAGE_ID holding a {path: {id, title, url}} JSON map, stored in a
fenced ```json code block (an HTML comment, Outline's marker of choice,
isn't reliably preserved by Notion's markdown converter; a fenced code block
is) -- see REGISTRY_TITLE, parse_registry(), render_registry(),
NotionMarkdownClient.get_page_markdown(), upsert_page_tracked(). A file
already in the registry updates by id regardless of what it title-cases to
now; only a file the registry has never seen falls through to the old
find_child_page() title match, which is also how the registry bootstraps
itself against a repo's pre-existing Notion pages the first time it runs. The
registry page also renders as a plain markdown link table, doubling as a
deep-link index. A registry entry whose source file is gone prints an
ORPHAN warning instead of vanishing silently -- archive or delete it by hand
in Notion; nothing is ever auto-deleted by this script.

Usage:
    python scripts/ops/sync_docs_to_notion.py --docs-dir docs/ --root-page-id <id>

Requires:
    pip install httpx
    NOTION_API_KEY env var set
    Notion-Version 2026-03-11+ (markdown create/replace endpoints)

Rules:
- Skips _archive/, archive/, datasets/, assets/, visualization/ at any depth
- Aborts if any file contains a secret pattern
- Maps docs/ subfolder structure to Notion child page hierarchy under root page
- Upserts by a sync-registry id when known (rename-safe), else by title: creates
  with `markdown=`; updates via PATCH .../markdown replace_content
- Folder shells: create if missing; never wipe nested child pages
- --expect-root-title: abort instead of silently syncing into the wrong tree
- Sync registry: reserved "_Sync Registry" page under NOTION_ROOT_PAGE_ID mapping
  path -> {id, title, url}; doubles as a deep-link index (see 2026-09-23 note below)

Never dump raw markdown into Notion's legacy block-append API
(chunking text into ≤1900-char paragraph/heading blocks via
`PATCH /blocks/{id}/children`). That approach was still found in one repo
during the 2026-09-13 audit: it renders `#`/`|` as literal plain text
instead of real headings/tables, and (in that repo) shipped with *no*
secret scan at all. The markdown API below (`markdown=` on create,
`replace_content` on update) is the only supported path.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

SECRET_PATTERN = re.compile(
    r"(sk-[A-Za-z0-9]{40,}"
    r"|AIza[A-Za-z0-9_\-]{35}"
    r"|BEGIN (RSA|EC|OPENSSH) PRIVATE"
    r"|ntn_[A-Za-z0-9]{30,}"
    r"|ol_api_[A-Za-z0-9]{20,}"
    r"|ghp_[A-Za-z0-9]{36}"
    r"|glpat-[A-Za-z0-9_\-]{20,})",
    re.IGNORECASE,
)
SKIP_DIR_NAMES = {"_archive", "archive", "datasets", "assets", "visualization"}
NOTION_VERSION = "2026-03-11"
API_BASE = "https://api.notion.com/v1"

# Repo-root markdown files published under a docs/ folder path in Notion, for
# files that live outside docs/ by convention (AGENTS.md, MISTAKES.md) but
# still belong in the KB. Each entry: (path relative to repo root, folder
# path tuple under the root page). Empty tuple = directly under the root.
EXTRA_SYNC_ROOT: list[tuple[str, tuple[str, ...]]] = [
    ("AGENTS.md", ("operations",)),
    ("MISTAKES.md", ("operations",)),
    ("ARCHITECTURE.md", ("strategy",)),
    ("WISHLIST.md", ("operations",)),
]

# Notion API pacing -- mirrors the Outline golden script's throttle. A full
# docs/ sync fires many create/update calls back to back; pace them instead
# of relying entirely on 429 retry to keep CI runs from stalling.
MIN_REQUEST_INTERVAL = 0.35  # seconds between any two API calls

ACRONYMS = {
    "sql",
    "dtc",
    "fm",
    "gcp",
    "api",
    "prd",
    "csv",
    "json",
    "db",
    "uri",
    "url",
    "id",
    "mr",
    "ci",
    "cd",
    "cpu",
    "iot",
    "ota",
    "hbid",
    "imei",
    "ccid",
    "mac",
    "sdk",
    "aws",
    "ec2",
    "rds",
    "ai",
}

# Exact titles for stems the word-by-word algorithm below cannot produce --
# typically a minor word that should stay lowercase, never a rename
# workaround (a rename is handled by the sync registry below). Empty by
# default; add repo-specific entries in the per-repo deployed copy. Also the
# escape hatch if a repo's registry page is ever deleted by hand in Notion
# and a sync has to re-adopt an existing page by title from scratch.
TITLE_OVERRIDES: dict[str, str] = {}

# A registry page, upserted directly under NOTION_ROOT_PAGE_ID, maps repo-relative
# path -> {id, title, url} so a rename doesn't orphan a page. See the module
# docstring's 2026-09-23 entry. Renders as a plain link table plus a fenced JSON
# block the next sync run parses back out.
REGISTRY_TITLE = "_Sync Registry (auto-generated -- do not edit by hand)"
REGISTRY_JSON_FENCE = "```json sync-registry"


def _load_env() -> None:
    """Populate os.environ from .env, mirroring sync_docs_to_outline.py.

    Without this the two sibling scripts behaved differently: the Outline
    sync worked from a plain shell and the Notion one failed with
    "NOTION_API_KEY not set", so a local single-file sync only ever half
    happened. setdefault, so a real environment variable still wins.
    """
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())


def pretty_title(stem: str) -> str:
    """Convert a filename stem to a clean, readable title.

    Same logic as the Outline golden script's pretty_title(), ported here so
    both platforms show the same title for the same file (one repo's Notion
    and Outline titles previously diverged: "SIM_PROVIDER_API_REFERENCE" vs
    "SIM Provider API Reference").
    """
    if stem in TITLE_OVERRIDES:
        return TITLE_OVERRIDES[stem]

    stem = re.sub(r"\.(docx|pdf|xlsx|pptx|doc)$", "", stem, flags=re.IGNORECASE)
    stem = re.sub(r"^\d+[_\-\s]+", "", stem)
    stem = stem.strip("_- ")

    date_placeholders: dict[str, str] = {}

    def _protect_date(m: re.Match) -> str:
        key = f"DATETOKEN{len(date_placeholders)}"
        date_placeholders[key] = m.group().replace("_", "-")
        return key

    stem = re.sub(r"\d{4}[_\-]\d{2}[_\-]\d{2}", _protect_date, stem)
    stem = re.sub(r"[_\-]+", " ", stem)

    words = []
    for word in stem.split():
        if word in date_placeholders:
            words.append(date_placeholders[word])
        elif word.lower() in ACRONYMS:
            words.append(word.upper())
        elif word.lower().endswith("s") and word.lower()[:-1] in ACRONYMS:
            words.append(word[:-1].upper() + "s")
        else:
            words.append(word.capitalize())
    return " ".join(words)


def secret_scan(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    return [f"{path}: {m.group()[:60]}" for m in SECRET_PATTERN.finditer(text)]


def collect_docs(docs_dir: Path) -> list[Path]:
    files: list[Path] = []
    for md in sorted(docs_dir.rglob("*.md")):
        rel = md.relative_to(docs_dir)
        parts = rel.parts
        if any(p in SKIP_DIR_NAMES for p in parts[:-1]):
            continue
        if md.name == "README.md" and len(parts) == 1:
            continue
        files.append(md)
    return files


class NotionMarkdownClient:
    """Thin HTTP client for Notion page + markdown endpoints."""

    def __init__(self, api_key: str, *, timeout: float = 120.0) -> None:
        self._client = httpx.Client(
            base_url=API_BASE,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Notion-Version": NOTION_VERSION,
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )
        self._last_request_at = 0.0
        self._urls: dict[str, str] = {}  # page_id -> url, populated by create/update calls

    def close(self) -> None:
        self._client.close()

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < MIN_REQUEST_INTERVAL:
            time.sleep(MIN_REQUEST_INTERVAL - elapsed)
        self._last_request_at = time.monotonic()

    def _request(self, method: str, path: str, **kwargs) -> dict:
        for attempt in range(5):
            self._throttle()
            resp = self._client.request(method, path, **kwargs)
            if resp.status_code == 429:
                wait = float(resp.headers.get("Retry-After", "1"))
                time.sleep(max(wait, 1.0))
                continue
            if resp.status_code >= 500 and attempt < 4:
                time.sleep(1.5 * (attempt + 1))
                continue
            # Cloudflare throttles a burst of writes with a 403 carrying an
            # HTML challenge page, not Notion's JSON error envelope. That is a
            # rate limit wearing a permission error's status code: retrying
            # after a pause succeeds, where raising aborts the whole sync on
            # file ~N of 68. A real Notion permission 403 returns JSON, so the
            # body shape is what separates them.
            if (
                resp.status_code == 403
                and "text/html" in resp.headers.get("content-type", "")
                and attempt < 4
            ):
                wait = 5.0 * (2**attempt)  # 5s, 10s, 20s, 40s
                print(
                    f"  ...Cloudflare throttled {method} {path}; "
                    f"retrying in {wait:.0f}s (attempt {attempt + 1}/5)",
                    file=sys.stderr,
                )
                time.sleep(wait)
                continue
            if resp.status_code >= 400:
                raise RuntimeError(
                    f"Notion API {method} {path} -> {resp.status_code}: {resp.text[:500]}"
                )
            if resp.status_code == 204 or not resp.content:
                return {}
            return resp.json()
        raise RuntimeError(f"Notion API {method} {path} failed after retries")

    def get_page_title(self, page_id: str) -> str:
        page = self._request("GET", f"/pages/{page_id}")
        title_prop = page.get("properties", {}).get("title", {})
        rich_text = title_prop.get("title", [])
        return "".join(t.get("plain_text", "") for t in rich_text)

    def list_child_pages(self, parent_id: str) -> list[dict]:
        pages: list[dict] = []
        cursor = None
        while True:
            params: dict = {"page_size": 100}
            if cursor:
                params["start_cursor"] = cursor
            resp = self._request("GET", f"/blocks/{parent_id}/children", params=params)
            for block in resp.get("results", []):
                if block.get("type") == "child_page":
                    pages.append(
                        {
                            "id": block["id"],
                            "title": block["child_page"]["title"],
                        }
                    )
            if not resp.get("has_more"):
                break
            cursor = resp.get("next_cursor")
        return pages

    def find_child_page(self, parent_id: str, title: str) -> str | None:
        for page in self.list_child_pages(parent_id):
            if page["title"] == title:
                return page["id"]
        return None

    def create_page(self, parent_id: str, title: str, markdown: str) -> str:
        body = {
            "parent": {"type": "page_id", "page_id": parent_id},
            "properties": {
                "title": {
                    "title": [{"type": "text", "text": {"content": title[:2000]}}]
                }
            },
            "markdown": markdown or f"# {title}\n",
        }
        page = self._request("POST", "/pages", json=body)
        if page.get("url"):
            self._urls[page["id"]] = page["url"]
        return page["id"]

    def replace_markdown(self, page_id: str, markdown: str) -> None:
        body = {
            "type": "replace_content",
            "replace_content": {"new_str": markdown or "\n"},
            "allow_deleting_content": True,
        }
        resp = self._request("PATCH", f"/pages/{page_id}/markdown", json=body)
        if resp.get("url"):
            self._urls[page_id] = resp["url"]

    def update_title(self, page_id: str, title: str) -> None:
        page = self._request(
            "PATCH",
            f"/pages/{page_id}",
            json={
                "properties": {
                    "title": {
                        "title": [{"type": "text", "text": {"content": title[:2000]}}]
                    }
                }
            },
        )
        if page.get("url"):
            self._urls[page_id] = page["url"]

    def url_for(self, page_id: str) -> str:
        return self._urls.get(page_id, "")

    def get_page_markdown(self, page_id: str) -> str | None:
        """Return a page's current markdown body, or None if it no longer exists."""
        try:
            resp = self._request("GET", f"/pages/{page_id}/markdown")
        except RuntimeError as exc:
            if "404" in str(exc) or "object_not_found" in str(exc):
                return None
            raise
        return resp.get("markdown", "") if isinstance(resp, dict) else ""


def upsert_page(
    client: NotionMarkdownClient,
    parent_id: str,
    title: str,
    content: str,
    *,
    replace_body: bool = True,
) -> str:
    existing = client.find_child_page(parent_id, title)
    if existing:
        client.update_title(existing, title)
        if not replace_body:
            print(f"KEEP   {title}")
            return existing
        client.replace_markdown(existing, content)
        print(f"UPDATE  {title}")
        return existing
    page_id = client.create_page(parent_id, title, content)
    print(f"CREATE  {title}")
    return page_id


def upsert_page_tracked(
    client: NotionMarkdownClient,
    registry_id: str | None,
    parent_id: str,
    title: str,
    content: str,
) -> str:
    """Upsert by a known page id from the sync registry, falling back to
    upsert_page() (title match, then create) exactly like the Outline
    sibling's upsert_tracked(). This is what makes a filename rename safe:
    as long as the registry entry (path -> page id) is intact, the page
    updates in place -- same id, same URL -- no matter what pretty_title()
    now computes for it.
    """
    if registry_id:
        try:
            client.update_title(registry_id, title)
            client.replace_markdown(registry_id, content)
            print(f"UPDATE  {title}  (registry id)")
            return registry_id
        except RuntimeError as exc:
            if "404" not in str(exc) and "object_not_found" not in str(exc):
                raise
            print(
                f"WARN    registry id {registry_id} for '{title}' no longer "
                f"resolves -- falling back to title match"
            )
    return upsert_page(client, parent_id, title, content)


def parse_registry(text: str | None) -> dict[str, dict[str, str]]:
    """Extract the {path: {id, title, url}} map from the registry page's body.

    Returns {} for a missing/new/corrupt registry -- callers treat that the
    same as "no repo has been adopted yet" and fall through to title
    matching, never an exception, so a damaged registry degrades to old
    behaviour instead of crashing the sync.
    """
    if not text:
        return {}
    start = text.find(REGISTRY_JSON_FENCE)
    if start == -1:
        return {}
    end = text.find("```", start + len(REGISTRY_JSON_FENCE))
    if end == -1:
        return {}
    try:
        raw = json.loads(text[start + len(REGISTRY_JSON_FENCE) : end].strip())
    except (ValueError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def render_registry(entries: dict[str, dict[str, str]], repo_name: str) -> str:
    """Render the registry page: a human-readable link table, plus the fenced
    JSON block the next sync run parses back out with parse_registry()."""
    lines = [
        f"# {REGISTRY_TITLE}",
        "",
        f"Maps every synced `docs/` (and extra-root) file in **{repo_name}** to its "
        "Notion page, so renaming the source file updates the same page instead "
        "of creating a duplicate, and so any path below can be opened directly.",
        "",
        "| Path | Title | Link |",
        "|---|---|---|",
    ]
    for path in sorted(entries):
        meta = entries[path]
        url = meta.get("url", "")
        title = meta.get("title", "")
        link = f"[open]({url})" if url else "(no url)"
        lines.append(f"| `{path}` | {title} | {link} |")
    lines += [
        "",
        REGISTRY_JSON_FENCE,
        json.dumps(entries, indent=2, sort_keys=True),
        "```",
        "",
    ]
    return "\n".join(lines)


def folder_to_parent_id(
    client: NotionMarkdownClient,
    root_id: str,
    folder_parts: tuple[str, ...],
    cache: dict[str, str],
) -> str:
    if not folder_parts:
        return root_id
    key = "/".join(folder_parts)
    if key in cache:
        return cache[key]
    parent_id = cache.get("/".join(folder_parts[:-1]), root_id)
    title = pretty_title(folder_parts[-1])
    doc_id = upsert_page(client, parent_id, title, f"# {title}\n", replace_body=False)
    cache[key] = doc_id
    return doc_id


def main() -> None:
    _load_env()
    parser = argparse.ArgumentParser()
    parser.add_argument("--docs-dir", default="docs")
    parser.add_argument(
        "--file",
        default="",
        help=(
            "Sync ONE file, given relative to --docs-dir, instead of the whole "
            "tree. Lets a file outside docs/ be synced without walking the repo: "
            "--docs-dir . --file MISTAKES.md"
        ),
    )
    parser.add_argument(
        "--root-page-id",
        default=os.environ.get("NOTION_ROOT_PAGE_ID", ""),
        help="Notion hub page ID (or set NOTION_ROOT_PAGE_ID)",
    )
    parser.add_argument(
        "--no-extra-root",
        action="store_true",
        help="Skip EXTRA_SYNC_ROOT files (repo-root markdown like AGENTS.md/MISTAKES.md).",
    )
    parser.add_argument(
        "--expect-root-title",
        default=os.environ.get("NOTION_EXPECTED_ROOT_TITLE", ""),
        help=(
            "Sanity check: abort if the resolved NOTION_ROOT_PAGE_ID's title "
            "doesn't match this (case-insensitive). 2026-09: a stale/copied "
            "NOTION_ROOT_PAGE_ID (shared with the Outline sync's equivalent "
            "misconfiguration) silently synced one repo's docs/ tree into an "
            "unrelated project's page tree -- find_child_page only ever looks "
            "under whatever root_page_id it's given, so a wrong root means "
            "every doc looks new every run. A second, separate incident found "
            "two DIFFERENT repos both hardcoding the SAME NOTION_ROOT_PAGE_ID "
            "with no guard at all -- same-named docs in either repo silently "
            "overwrite the other's page. Set NOTION_EXPECTED_ROOT_TITLE in "
            ".env to enable (shared with sync_docs_to_outline.py)."
        ),
    )
    args = parser.parse_args()

    api_key = os.environ.get("NOTION_API_KEY")
    if not api_key:
        print("ERROR: NOTION_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    if not args.root_page_id:
        print("ERROR: --root-page-id or NOTION_ROOT_PAGE_ID required", file=sys.stderr)
        sys.exit(1)

    docs_dir = Path(args.docs_dir)
    if not docs_dir.exists():
        print(f"ERROR: {docs_dir} not found", file=sys.stderr)
        sys.exit(1)
    repo_root = docs_dir.resolve().parent

    if args.file:
        one = docs_dir / args.file
        if not one.is_file():
            print(f"ERROR: {one} not found", file=sys.stderr)
            sys.exit(1)
        files = [one]
        extra_files: list[tuple[Path, tuple[str, ...]]] = []
    else:
        files = collect_docs(docs_dir)
        extra_files = []
        if not args.no_extra_root:
            for rel_path, folder_parts in EXTRA_SYNC_ROOT:
                src = repo_root / rel_path
                if src.is_file():
                    extra_files.append((src, folder_parts))
                else:
                    print(f"WARN: extra sync root missing: {rel_path}", file=sys.stderr)

    findings: list[str] = []
    for f in files:
        findings.extend(secret_scan(f))
    for f, _ in extra_files:
        findings.extend(secret_scan(f))
    if findings:
        print("ABORT: secrets detected:", file=sys.stderr)
        for f in findings:
            print(f"  {f}", file=sys.stderr)
        sys.exit(1)

    print(
        f"Syncing {len(files)} docs + {len(extra_files)} root doc(s) to Notion "
        f"via markdown API (root: {args.root_page_id}, version: {NOTION_VERSION})"
    )
    client = NotionMarkdownClient(api_key)

    if args.expect_root_title:
        actual_title = client.get_page_title(args.root_page_id)
        if actual_title.strip().lower() != args.expect_root_title.strip().lower():
            print(
                f"ERROR: NOTION_ROOT_PAGE_ID ({args.root_page_id}) resolves to "
                f"'{actual_title}', not '{args.expect_root_title}'. Refusing to "
                f"sync -- this is exactly how a docs/ tree ends up duplicated "
                f"under an unrelated project's page tree. Fix NOTION_ROOT_PAGE_ID "
                f"in .env (and the CI repo secret/variable, if it uses a "
                f"different value).",
                file=sys.stderr,
            )
            client.close()
            sys.exit(1)
        print(f"Root check OK: root page resolves to '{actual_title}'.")

    registry_id = client.find_child_page(args.root_page_id, REGISTRY_TITLE)
    known_registry = parse_registry(client.get_page_markdown(registry_id)) if registry_id else {}
    if known_registry:
        print(f"Loaded sync registry: {len(known_registry)} tracked path(s).")

    def registry_key(path: Path) -> str:
        try:
            return str(path.relative_to(repo_root)).replace("\\", "/")
        except ValueError:
            return str(path).replace("\\", "/")

    cache: dict[str, str] = {}
    failed: list[tuple[str, str]] = []
    new_entries: dict[str, dict[str, str]] = {}
    try:
        for md in files:
            rel = md.relative_to(docs_dir)
            folder_parts = rel.parts[:-1]
            title = pretty_title(md.stem)
            content = md.read_text(encoding="utf-8")
            parent_id = folder_to_parent_id(
                client, args.root_page_id, folder_parts, cache
            )
            key = registry_key(md)
            # One unsyncable file must not cost the other 67. This aborted the
            # whole run on file ~N, leaving the KB silently half-updated with
            # no record of which half.
            try:
                page_id = upsert_page_tracked(
                    client, known_registry.get(key, {}).get("id"), parent_id, title, content
                )
                new_entries[key] = {"id": page_id, "title": title, "url": client.url_for(page_id)}
            except Exception as exc:
                reason = str(exc)
                if "Cloudflare" in reason:
                    reason = (
                        "blocked by Cloudflare WAF (403) — the document body "
                        "contains markup the edge rejects, e.g. literal "
                        "<script>/<style> tags quoted inside a security finding"
                    )
                print(f"  FAIL    {rel}: {reason[:200]}", file=sys.stderr)
                failed.append((str(rel), reason[:200]))

        for src, folder_parts in extra_files:
            title = pretty_title(src.stem)
            content = src.read_text(encoding="utf-8")
            parent_id = folder_to_parent_id(client, args.root_page_id, folder_parts, cache)
            key = registry_key(src)
            try:
                page_id = upsert_page_tracked(
                    client, known_registry.get(key, {}).get("id"), parent_id, title, content
                )
                new_entries[key] = {"id": page_id, "title": title, "url": client.url_for(page_id)}
            except Exception as exc:
                print(f"  FAIL    {src}: {str(exc)[:200]}", file=sys.stderr)
                failed.append((str(src), str(exc)[:200]))

        if args.file:
            # Partial run: merge this one entry into the existing registry rather
            # than treating every untouched path as an orphan.
            merged = {**known_registry, **new_entries}
        else:
            merged = new_entries
            orphaned = set(known_registry) - set(new_entries) - {rel for rel, _ in failed}
            for key in sorted(orphaned):
                old = known_registry[key]
                print(
                    f"  ORPHAN  {key} -- source file gone but "
                    f"'{old.get('title')}' ({old.get('url')}) still exists in Notion. "
                    f"Archive or delete it by hand if it's no longer wanted."
                )

        upsert_page(
            client, args.root_page_id, REGISTRY_TITLE, render_registry(merged, repo_root.name)
        )
    finally:
        client.close()

    total = len(files) + len(extra_files)
    synced = total - len(failed)
    print(f"Done. {synced}/{total} synced.")
    if failed:
        print(f"\n{len(failed)} file(s) did NOT sync:", file=sys.stderr)
        for rel, reason in failed:
            print(f"  - {rel}\n      {reason}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
