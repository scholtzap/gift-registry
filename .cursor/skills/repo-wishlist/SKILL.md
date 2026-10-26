---
name: repo-wishlist
description: >-
  Installs git-root WISHLIST.md and appends agent tooling, access, automation,
  skill, quickref, and inefficiency asks using the same discipline as
  MISTAKES.md. Use when seeding wishlists in a repo, auditing discovery tax,
  or when the user asks to populate WISHLIST.md. Routine appends during other
  work follow the always-on wishlist Cursor rule — invoke this skill for
  install, bulk audit, or template questions.
---

# repo-wishlist

Per-repo **agent** wishlist — not a human task list. Mirrors `MISTAKES.md`: git-root file, newest first, no secrets, session digest, stop hook.

Ops: `bike-tracker/docs/operations/AGENT_KNOWLEDGE_ECOSYSTEM.md`

## Prompt improvements (use these, not the old umbrella-only rule)

**Append when** (any of):

- Missing CLI, MCP, API **scope**, GitHub secret **name**, skill, or CI that blocked or slowed the session
- A repeated manual step should be a hook/script/CI
- **Discovery tax / inefficiency:** you grepped, globbed, browsed AWS/Mongo/WP/admin, or read five SPECs to find a fact that could be a one-line pointer in `ARCHITECTURE.md`, a runbook, or an index
- Graphify / architecture map missing so every agent re-learns the tree
- A dedicated skill would cut tokens on a recurring task class

**Append even if you finished the hunt this session.** The next agent should not pay the same tax. The old “do not append if you can complete it yourself” rule applies only to **installing a tool you can install now** — install it, then still log if the gap was undocumented.

**Do not append when:**

- The item is an agent **error** → `MISTAKES.md`
- The item is product/ops work → `docs/plans/`
- Duplicate of an **open** entry below (bump date or add a note)
- You would need to paste a secret, token, or credentialed URL

**Prefer fulfill-in-session for `quickref`:** add the pointer to `ARCHITECTURE.md` (or the runbook) in the same turn, then mark the wish **fulfilled**. Leave the entry for history.

## Routing

| Scope | File |
|-------|------|
| This git repo | `WISHLIST.md` at git root |
| Cross-repo MCP / global CLI / Cursor+Claude skills | umbrella `Documents/3bo/WISHLIST.md` |
| Both | repo canonical + one-line umbrella pointer |

## Template

Newest first. No secrets.

```markdown
## YYYY-MM-DD — short title
**Kind:** tooling | access | automation | skill | quickref | inefficiency
**Requested by:** agent (brief context — repo/task)
**Pain:** what you had to do instead (search, explore, wait)
**What would help:** concrete ask (CLI, MCP, path in ARCHITECTURE.md, skill, hook, CI)
**Where it should live:** ARCHITECTURE.md §N / runbook path / MCP / skill / CI
**Alternatives considered:** optional
**Status:** open
```

When done: set `**Status:** fulfilled YYYY-MM-DD` and one line of what shipped. Do not delete.

## Install

```bash
python bike-tracker/scripts/ops/install_agent_knowledge.py --target /path/to/repo --append-agents
```

Creates `WISHLIST.md` (if missing), `.cursor/rules/wishlist.mdc`, copies `wishlist_audit.py`, optional AGENTS.md snippet.

## Digest

```bash
python bike-tracker/scripts/ops/wishlist_session_digest.py
```

## Bulk audit (this skill)

1. List git roots under the workspace.
2. For each: ensure `WISHLIST.md` header exists.
3. Scan recent `MISTAKES.md` and session notes for discovery-tax patterns that were never wished.
4. Dedup; do not clone mistakes into wishlist unless the *fix* is infra/docs-index, not a code bug.
