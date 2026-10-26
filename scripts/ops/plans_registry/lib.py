"""Core library for docs/plans registry (audit + index generation)."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL | re.MULTILINE)
BODY_STATUS_RE = re.compile(r"^\*\*Status:\*\*\s*(.+?)\s*$", re.MULTILINE)
# Anchored to a HEADING, and word-bounded. Without \b, "Open" matched any word
# starting with those letters -- a wrapped prose line reading "opens this CSV;
# `storage_report.py` and ..." was lifted into the index's Next column as if it
# were a next action. Without the heading anchor, any paragraph line beginning
# "Next ..." or "Open ..." qualifies, which is the same bug waiting on the next
# document. A doc with no such heading falls through to the `- [ ]` scan below
# and otherwise shows blank -- an empty cell beats confident nonsense.
NEXT_ACTION_RE = re.compile(
    r"^#{2,6}\s+(?:Next|Open|In progress)\b.*$",
    re.MULTILINE | re.IGNORECASE,
)

VALID_TYPES = frozenset({"spec", "todo", "bugfix", "handover", "meta", "reference"})
VALID_STATUSES = frozenset(
    {
        "draft",
        "spec",
        "ready",
        "implementing",
        "implemented",
        "backlog",
        "superseded",
        "cancelled",
    }
)

#: Statuses that mean "still open". Kept beside VALID_STATUSES because the two
#: drifted: `ready` was in use by handover docs, rejected by the validator as
#: `invalid status: ready`, AND absent here - so a `ready` doc whose first 800
#: characters happened to say "shipped" or "done" was classified
#: archive_candidate on the strength of a body-text guess, over an explicit
#: frontmatter status saying it had not started. A handover page describing
#: what is already finished trips that every time.
ACTIVE_STATUSES = frozenset({"draft", "spec", "ready", "implementing", "backlog"})

VALID_PRIORITIES = frozenset({"P0", "P1", "P2", "P3"})

SKIP_BASENAMES = frozenset(
    {
        "PLANS_INDEX.md",
        "PLANS_AUDIT_REPORT.md",
        "PLANS_ARCHIVE_HOLD.md",
        "README.md",
    }
)

META_BASENAMES = frozenset(
    {
        "PLANS_WORK_REGISTRY_SPEC.md",
        "RELOCATION_MAP.md",
    }
)

ARCHIVE_STATUS_WORDS = re.compile(
    r"(?:"
    r"implemented|shipped|done|complete|archived|superseded|"
    r"closed|retired|not scheduled"
    r")",
    re.IGNORECASE,
)

IMPLEMENTED_STRONG = re.compile(
    r"(?:"
    r"\bimplemented\b|\bshipped\b|\bcomplete\b|"
    r"closed\s+20\d{2}|done\s+20\d{2}"
    r")",
    re.IGNORECASE,
)

SKIP_SUBDIRS = frozenset({"_templates"})

GENERATED_MARKER = "plans-registry-generated"


@dataclass
class PlanItem:
    path: Path
    rel_path: str
    plans_root: Path
    repo_root: Path
    frontmatter: Dict[str, Any] = field(default_factory=dict)
    body: str = ""
    body_status: str = ""
    classification: str = "work_item"
    classification_reason: str = ""
    issues: List[str] = field(default_factory=list)
    suggested_action: str = ""
    inbound_links: int = 0

    @property
    def title(self) -> str:
        t = self.frontmatter.get("title")
        if t:
            return str(t)
        return self.path.stem.replace("_", " ")

    @property
    def status(self) -> str:
        s = self.frontmatter.get("status")
        if s:
            return str(s)
        return infer_status_from_text(self.body_status or self.body)

    @property
    def priority(self) -> str:
        p = self.frontmatter.get("priority")
        if p:
            return str(p)
        return "P3"

    @property
    def rank(self) -> int:
        r = self.frontmatter.get("rank")
        if r is None:
            return 999
        try:
            return int(r)
        except (TypeError, ValueError):
            return 999

    @property
    def updated(self) -> str:
        u = self.frontmatter.get("updated")
        if u:
            return str(u)
        return ""

    @property
    def in_archive(self) -> bool:
        return "archive" in self.path.parts


def find_repo_root(start: Optional[Path] = None) -> Path:
    start = start or Path.cwd()
    for candidate in [start, *start.parents]:
        if (candidate / ".git").exists():
            return candidate
    return start


def resolve_plans_dir(repo_root: Path, plans_subpath: str = "docs/plans") -> Path:
    return repo_root / plans_subpath


def parse_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    raw = match.group(1)
    body = text[match.end():]
    if yaml is None:
        return {}, text
    try:
        meta = yaml.safe_load(raw) or {}
        if not isinstance(meta, dict):
            meta = {}
    except yaml.YAMLError:
        meta = {}
    return meta, body


def infer_type_from_name(name: str) -> str:
    upper = name.upper()
    if "_SPEC" in upper or upper.endswith("_SPEC.MD"):
        return "spec"
    if "_TODO" in upper or upper.endswith(".TODO.MD"):
        return "todo"
    if "BUGFIX" in upper:
        return "bugfix"
    if "HANDOVER" in upper:
        return "handover"
    if "INVARIANTS" in upper or "PERSONAS" in upper or "MATRIX" in upper:
        return "reference"
    return "spec"


def infer_status_from_text(text: str) -> str:
    if not text:
        return "draft"
    lower = text.lower()
    if "superseded" in lower:
        return "superseded"
    if IMPLEMENTED_STRONG.search(text):
        return "implemented"
    if "implementing" in lower or "in progress" in lower:
        return "implementing"
    if "backlog" in lower or "not scheduled" in lower or "not started" in lower:
        return "backlog"
    if "spec" in lower and "ready" in lower:
        return "spec"
    if "draft" in lower:
        return "draft"
    return "draft"


def extract_body_status(body: str) -> str:
    match = BODY_STATUS_RE.search(body)
    if match:
        return match.group(1).strip()
    return ""


def extract_next_action(body: str) -> str:
    lines = body.splitlines()
    for i, line in enumerate(lines):
        if NEXT_ACTION_RE.match(line.strip()):
            for j in range(i + 1, min(i + 6, len(lines))):
                candidate = lines[j].strip()
                if candidate and not candidate.startswith("#"):
                    return candidate[:120]
    for line in lines[:40]:
        stripped = line.strip()
        if stripped.startswith("- [ ]"):
            return stripped[:120]
    return ""


def classify_item(item: PlanItem) -> None:
    name = item.path.name
    rel = item.rel_path.replace("\\", "/")

    if name in SKIP_BASENAMES and not item.in_archive:
        item.classification = "skip"
        item.classification_reason = "generated or index skip list"
        return

    if name in META_BASENAMES:
        item.classification = "meta"
        item.classification_reason = "registry meta doc"
        return

    if "/spikes/" in rel or rel.startswith("spikes/"):
        item.classification = "relocate_spike"
        item.classification_reason = "spikes/ - experiments, not queue"
        item.suggested_action = "keep in spikes/ or move tooling to docs/architecture/"
        return

    suffix = item.path.suffix.lower()
    if suffix in {".py", ".drawio", ".csv", ".json", ".html"}:
        item.classification = "relocate_artifact"
        item.classification_reason = f"non-markdown artifact ({suffix})"
        item.suggested_action = "move to docs/architecture/ or spikes/"
        return

    upper = name.upper()

    # The three relocate_* rules below guess a document's kind from its
    # FILENAME. A file whose frontmatter declares a valid type has already
    # said what it is, so the guess is not merely redundant -- it overrules
    # the author. A `type: spec` named WIFI_GATEWAY_AUDIT_REWIRE.md was
    # silently dropped from PLANS_INDEX.md by the `_AUDIT_` rule, where a P2
    # spec then sat invisible in the queue while a freshly regenerated index
    # appeared to vouch for it.
    #
    # Skipping ahead rather than returning: a declared type says what the
    # document IS, not whether it is still open, so the archive and status
    # rules below must still run. An archived `type: spec` is `archived`.
    if item.frontmatter.get("type") not in VALID_TYPES:
        if (
            "PERSONAS" in upper
            or "IDENTITY_AND_ACCESS" in upper
            or "PERMISSION_MATRIX" in upper
            or "INVARIANTS" in upper
        ):
            item.classification = "relocate_reference"
            item.classification_reason = "canonical reference / personas / matrix"
            item.suggested_action = "move to docs/architecture/ or docs/security/"
            return

        if "LEARNINGS" in upper or (
            "_AUDIT_" in upper and "SPEC" not in upper and "TODO" not in upper
        ):
            item.classification = "relocate_learnings"
            item.classification_reason = "learnings / audit notes"
            item.suggested_action = "move to docs/operations/learnings/"
            return

        if (
            name.startswith("xneelo_")
            or name.startswith("GCP_")
            or "_RUNBOOK" in upper
            or upper.endswith("_SETUP.MD")
        ):
            item.classification = "relocate_runbook"
            item.classification_reason = "runbook / setup living in plans/"
            item.suggested_action = "move to docs/operations/"
            return

    if item.in_archive:
        item.classification = "archived"
        item.classification_reason = "already in archive/"
        return

    status = item.status
    body_blob = f"{item.body_status} {item.body[:800]}"
    if status in {"implemented", "superseded", "cancelled"}:
        item.classification = "archive_candidate"
        item.classification_reason = f"status={status}"
        item.suggested_action = "git mv to archive/; fix inbound links; doc-kb-save"
        return

    if (
        status not in ACTIVE_STATUSES
        and IMPLEMENTED_STRONG.search(body_blob)
        and "not implemented" not in body_blob.lower()
    ):
        item.classification = "archive_candidate"
        item.classification_reason = "body suggests shipped/implemented"
        item.suggested_action = "verify evidence + deploy; then archive"
        return

    item.classification = "work_item"
    item.classification_reason = "actionable plan/todo/spec"


def discover_plan_files(
    plans_dir: Path,
    include_archive: bool = True,
) -> List[Path]:
    if not plans_dir.is_dir():
        return []
    files: List[Path] = []
    for path in sorted(plans_dir.rglob("*")):
        if not path.is_file():
            continue
        rel_parts = path.relative_to(plans_dir).parts
        if any(part in SKIP_SUBDIRS for part in rel_parts):
            continue
        if path.suffix.lower() != ".md":
            continue
        files.append(path)
    if not include_archive:
        files = [p for p in files if "archive" not in p.parts]
    return files


def load_plan_item(
    path: Path,
    plans_dir: Path,
    repo_root: Path,
    inbound_links: int = 0,
) -> PlanItem:
    text = path.read_text(encoding="utf-8", errors="replace")
    fm, body = parse_frontmatter(text)
    rel = path.relative_to(plans_dir).as_posix()
    item = PlanItem(
        path=path,
        rel_path=rel,
        plans_root=plans_dir,
        repo_root=repo_root,
        frontmatter=fm,
        body=body,
        body_status=extract_body_status(body),
        inbound_links=inbound_links,
    )
    classify_item(item)
    return item


def count_inbound_links(repo_root: Path, rel_plan_path: str) -> int:
    """Count markdown files in repo that link to this plan basename."""
    basename = Path(rel_plan_path).name
    pattern = re.compile(re.escape(basename))
    count = 0
    for md in repo_root.rglob("*.md"):
        if "node_modules" in md.parts or ".git" in md.parts:
            continue
        try:
            if pattern.search(md.read_text(encoding="utf-8", errors="replace")):
                count += 1
        except OSError:
            continue
    return count


def validate_frontmatter(item: PlanItem) -> List[str]:
    issues: List[str] = []
    if item.classification not in {"work_item", "archive_candidate"}:
        return issues
    if not item.frontmatter:
        issues.append("missing YAML frontmatter")
    else:
        for key in ("title", "type", "status", "priority", "rank", "updated"):
            if key not in item.frontmatter:
                issues.append(f"missing frontmatter key: {key}")
        t = item.frontmatter.get("type")
        if t and str(t) not in VALID_TYPES:
            issues.append(f"invalid type: {t}")
        s = item.frontmatter.get("status")
        if s and str(s) not in VALID_STATUSES:
            issues.append(f"invalid status: {s}")
        p = item.frontmatter.get("priority")
        if p and str(p) not in VALID_PRIORITIES:
            issues.append(f"invalid priority: {p}")
    fm_status = str(item.frontmatter.get("status", ""))
    if item.body_status and fm_status and fm_status != item.status:
        if infer_status_from_text(item.body_status) != fm_status:
            issues.append("body **Status:** diverges from frontmatter status")
    return issues


def audit_items(items: List[PlanItem]) -> List[PlanItem]:
    for item in items:
        item.issues = validate_frontmatter(item)
    return items


def _sort_work_items(items: List[PlanItem]) -> List[PlanItem]:
    priority_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    return sorted(
        items,
        key=lambda i: (priority_order.get(i.priority, 9), i.rank, i.rel_path),
    )


def generate_index_markdown(
    items: List[PlanItem],
    repo_name: str,
    refresh_cmd: str,
) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    active_work = [
        i
        for i in items
        if i.classification == "work_item" and not i.in_archive
    ]
    archived = [i for i in items if i.in_archive]

    lines = [
        "# Plans index",
        "",
        f"<!-- {GENERATED_MARKER} -->",
        "",
        "**Do not edit.** Regenerate:",
        "",
        f"```bash",
        refresh_cmd,
        "```",
        "",
        f"Generated: {now} · repo: `{repo_name}`",
        "",
    ]

    for prio in ("P0", "P1", "P2", "P3"):
        bucket = [i for i in active_work if i.priority == prio]
        if not bucket:
            continue
        lines.append(f"## {prio}")
        lines.append("")
        lines.append("| Rank | Title | Status | Path | Next |")
        lines.append("|------|-------|--------|------|------|")
        for item in _sort_work_items(bucket):
            next_a = extract_next_action(item.body).replace("|", "\\|")
            title = item.title.replace("|", "\\|")
            lines.append(
                f"| {item.rank} | {title} | {item.status} | `{item.rel_path}` | {next_a} |"
            )
        lines.append("")

    if archived:
        lines.append("## Archive (`archive/`)")
        lines.append("")
        lines.append("| Title | Status | Path |")
        lines.append("|-------|--------|------|")
        for item in sorted(archived, key=lambda i: i.rel_path):
            title = item.title.replace("|", "\\|")
            lines.append(
                f"| {title} | {item.status} | `{item.rel_path}` |"
            )
        lines.append("")

    content = "\n".join(lines) + "\n"
    return content


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


_GENERATED_LINE_RE = re.compile(r"^Generated: .*$", re.MULTILINE)


def stable_hash(text: str) -> str:
    """Hash content ignoring the `Generated: <timestamp>` line.

    That line is regenerated with the current wall-clock time on every
    invocation, so hashing it directly made --check spuriously fail
    whenever --write and --check ran in different minutes even though
    nothing else changed.
    """
    return content_hash(_GENERATED_LINE_RE.sub("Generated: <normalized>", text))


#: Directories never worth walking when hunting strays.
STRAY_SKIP_DIRS = frozenset(
    {
        ".git",
        ".dart_tool",
        ".venv",
        "venv",
        "node_modules",
        "build",
        "output",
        "__pycache__",
        "_archive",
        "site-packages",
    }
)


def find_stray_plans(repo_root: Path, plans_dir: Path) -> List[Dict[str, Any]]:
    """Markdown carrying plan frontmatter that lives OUTSIDE docs/plans/.

    A plan the registry cannot see is worse than an untracked one: the index
    regenerates cleanly and vouches for a queue the document is missing from.
    `docs/specs/WIFI_GATEWAY_DAILY_SUMMARY_SPEC.md` sat that way with a full
    `priority: P2, rank: 60` - queue metadata, no queue.

    Reported rather than relocated: a spec legitimately lives in docs/specs/,
    and only a human knows whether a given file wants moving, wants its rank
    dropping, or wants leaving exactly where it is.
    """
    strays: List[Dict[str, Any]] = []
    if not repo_root.is_dir():
        return strays
    try:
        plans_resolved = plans_dir.resolve()
    except OSError:
        plans_resolved = plans_dir
    for md in sorted(repo_root.rglob("*.md")):
        if any(part in STRAY_SKIP_DIRS for part in md.parts):
            continue
        try:
            if plans_resolved in md.resolve().parents:
                continue
        except OSError:
            continue
        try:
            fm, _ = parse_frontmatter(md.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            continue
        if not fm:
            continue
        declared_type = fm.get("type")
        declared_status = fm.get("status")
        if declared_type not in VALID_TYPES and declared_status not in VALID_STATUSES:
            continue
        # A doc with a priority or rank was meant to be queued; one with only a
        # type is likely reference material sitting correctly where it is.
        queued = fm.get("priority") is not None or fm.get("rank") is not None
        strays.append(
            {
                "path": md.relative_to(repo_root).as_posix(),
                "type": declared_type,
                "status": declared_status,
                "priority": fm.get("priority"),
                "rank": fm.get("rank"),
                "has_queue_metadata": queued,
            }
        )
    return strays


def generate_audit_report_markdown(
    items: List[PlanItem],
    repo_name: str,
    audit_cmd: str,
    strays: Optional[List[Dict[str, Any]]] = None,
) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    by_class: Dict[str, List[PlanItem]] = {}
    for item in items:
        by_class.setdefault(item.classification, []).append(item)

    lines = [
        "# Plans audit report",
        "",
        f"<!-- {GENERATED_MARKER} -->",
        "",
        f"Generated: {now} · repo: `{repo_name}`",
        "",
        f"Regenerate: `{audit_cmd}`",
        "",
        "## Summary",
        "",
        "| Classification | Count |",
        "|----------------|-------|",
    ]
    for cls in sorted(by_class.keys()):
        lines.append(f"| {cls} | {len(by_class[cls])} |")
    lines.append("")

    for cls in [
        "work_item",
        "archive_candidate",
        "relocate_reference",
        "relocate_learnings",
        "relocate_runbook",
        "relocate_spike",
        "relocate_artifact",
        "meta",
        "skip",
        "archived",
    ]:
        bucket = by_class.get(cls, [])
        if not bucket:
            continue
        lines.append(f"## {cls} ({len(bucket)})")
        lines.append("")
        lines.append("| Path | Status | Reason | Suggested action | Issues |")
        lines.append("|------|--------|--------|------------------|--------|")
        for item in sorted(bucket, key=lambda i: i.rel_path):
            issues = "; ".join(item.issues).replace("|", "\\|")
            reason = item.classification_reason.replace("|", "\\|")
            action = item.suggested_action.replace("|", "\\|")
            lines.append(
                f"| `{item.rel_path}` | {item.status} | {reason} | {action} | {issues} |"
            )
        lines.append("")

    if strays:
        queued = [s for s in strays if s["has_queue_metadata"]]
        lines.append(f"## stray plans outside docs/plans/ ({len(strays)})")
        lines.append("")
        lines.append(
            "Markdown carrying plan frontmatter that the registry does not "
            "index. The index still regenerates cleanly without them, which "
            "is what makes this worth printing: a clean index vouches for a "
            "queue these files are missing from."
        )
        lines.append("")
        if queued:
            lines.append(
                f"**{len(queued)} carry a priority or rank** - queue metadata "
                "with no queue. Those were meant to be triaged. Either move "
                "them into `docs/plans/`, or drop the queue fields so the "
                "document stops claiming a place in a list it is not in."
            )
            lines.append("")
        lines.append("| Path | Type | Status | Priority | Rank | Queue metadata |")
        lines.append("|------|------|--------|----------|------|----------------|")
        for s in sorted(strays, key=lambda x: x["path"]):
            flag = "**yes**" if s["has_queue_metadata"] else "no"
            lines.append(
                f"| `{s['path']}` | {s['type']} | {s['status']} | "
                f"{s['priority']} | {s['rank']} | {flag} |"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def generate_relocation_map_markdown(
    items: List[PlanItem],
    repo_name: str,
) -> str:
    relocate_classes = {
        "relocate_reference": "docs/architecture/",
        "relocate_learnings": "docs/operations/learnings/",
        "relocate_runbook": "docs/operations/",
        "relocate_spike": "docs/plans/spikes/ (keep)",
        "relocate_artifact": "docs/architecture/ or spikes/",
    }
    lines = [
        "# Plans relocation map",
        "",
        f"<!-- {GENERATED_MARKER} -->",
        "",
        f"Draft from audit · repo: `{repo_name}` · {date.today().isoformat()}",
        "",
        "Review before `git mv`. Fix inbound links in the same commit.",
        "",
        "| Source | Classification | Suggested target | Inbound links |",
        "|--------|----------------|------------------|---------------|",
    ]
    for item in sorted(items, key=lambda i: i.rel_path):
        if item.classification not in relocate_classes:
            continue
        target = relocate_classes[item.classification]
        lines.append(
            f"| `{item.rel_path}` | {item.classification} | `{target}` | {item.inbound_links} |"
        )
    lines.append("")
    return "\n".join(lines) + "\n"


def default_frontmatter(path: Path, body: str) -> Dict[str, Any]:
    name = path.name
    body_status = extract_body_status(body)
    return {
        "title": path.stem.replace("_", " "),
        "type": infer_type_from_name(name),
        "status": infer_status_from_text(body_status or body[:500]),
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


def render_frontmatter(meta: Dict[str, Any]) -> str:
    if yaml is None:
        raise RuntimeError("PyYAML required for --apply-frontmatter")
    return "---\n" + yaml.safe_dump(meta, default_flow_style=False).strip() + "\n---\n"
