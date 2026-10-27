# docs/ index

Source of truth for Gift Circles (WhatsApp-native group gift registry). Syncs to Notion via
GitHub Actions on push to `main` — see `.github/workflows/sync-notion-docs.yml`. Do not run
`/doc-kb-save` by hand; CI owns the sync.

| Folder | Holds |
|---|---|
| [`plans/`](plans/) | The work queue. Every plan, TODO, deferred item and handover, each with YAML frontmatter. Indexed by [`PLANS_INDEX.md`](plans/PLANS_INDEX.md), which is generated. |
| [`strategy/`](strategy/) | Product direction, positioning, competitor research, hackathon constraints. |
| [`strategy/investigations/`](strategy/investigations/) | Research findings that inform architecture or scope decisions. |
| [`strategy/waves/`](strategy/waves/) | Multi-day build phases and their exit criteria. |
| [`investigations/`](investigations/) | Ad-hoc technical investigations not tied to strategy. |
| [`operations/`](operations/) | Runbooks: API setup checklists, credentials inventory, deploy and demo-day procedures. |
| [`deployment/`](deployment/) | Hosting, environment and release notes. |
| [`_archive/`](_archive/) | Superseded docs. Never deleted; never synced (in `SKIP_DIRS`). |

Repo-root files also published to this tree: `AGENTS.md`, `MISTAKES.md`, `WISHLIST.md` →
`operations`; `ARCHITECTURE.md` → `strategy`.

## Key entry points

- [`strategy/Gift-Wishlist-App-Competitor-Analysis.md`](strategy/Gift-Wishlist-App-Competitor-Analysis.md) — the
  original product concept and market read.
- [`strategy/hackathon-rules-and-rubric.md`](strategy/hackathon-rules-and-rubric.md) — deadline, rules,
  disqualifiers and judging weights. The organizer-page PDFs it was written from are deliberately **not** in this
  repo (third-party prints plus one personal-mailbox notification, and this repo goes public for the submission);
  they live in `../gifts-registry-assets/hackathon/`.
- [`strategy/investigations/Meta-Model-API-and-WhatsApp-Cloud-API-findings.md`](strategy/investigations/Meta-Model-API-and-WhatsApp-Cloud-API-findings.md) —
  verified API facts the architecture rests on.
- [`operations/meta-integration-setup-checklist.md`](operations/meta-integration-setup-checklist.md) — day-1 keys,
  WABA, templates, webhooks.
- [`operations/demo-script-and-recording-checklist.md`](operations/demo-script-and-recording-checklist.md) — the
  3-minute video: shot order, what has to be live, and what may come from a committed fixture.
- [`plans/PLANS_INDEX.md`](plans/PLANS_INDEX.md) — the work queue in one table. Generated
  (`python scripts/ops/refresh_plans_index.py --write`); a hand edit is overwritten by the next run.
