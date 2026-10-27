---
title: Day-3 nine follow-ups (throttle, creation, pun, reveal, dispatch, landing)
type: todo
status: implementing
priority: P1
rank: 6
updated: 2026-10-27
apps: []
related:
  - gift-circles-ten-day-build-plan.md
  - parallel-build-closeout.md
  - gift-card-f10.md
  - post-event-reveal.md
  - whatsapp-task-bot-surface.md
  - public-landing-page.md
  - day-2-inventory-handover.md
evidence: User picked "All 9 follow-ups" 2026-10-27 (Done-when decision); base branch feat/schema-rls-leak-spine via merged PR #2
archived_date: null
supersedes: null
superseded_by: null
---

# Day-3 nine follow-ups

Scope picked by the user on 2026-10-27: all nine. Branch `feat/day-3-followups`, stacked on
PR #1 (`feat/schema-rls-leak-spine`). One commit per item; certify (typecheck + leak + full
test) before the stacked PR.

| # | Item | Home | Done when |
|---|---|---|---|
| 1 | Mount M-02 throttle at the gate | `security_best_practices_report.md` M-02 | Gate POST counts every attempt (key: circle + phone hash + forwarded address) before the allowlist lookup; 6th attempt in a minute gets uniform 429 + `Retry-After`; route test proves it |
| 2 | Branch hygiene | — | Merged `feat/two-dates-countdown` branch deleted local + remote after PR #2 merge is confirmed in PR #1's branch |
| 3 | ARCHITECTURE §6 billing quickref | `ARCHITECTURE.md` §6 | §6 states the PayFast decision (ZA rail, card-only recurring, gateway not MoR) in one pointer line, no re-litigation |
| 4 | Circle creation + tombstone | `gift-circles-ten-day-build-plan.md` day 5; `parallel-build-closeout.md` remaining #3 | Owner INSERT policy (expand-only migration) lets `createCircle` create circle + owner membership + allowlist hashes; `tombstoneItem` soft-deletes owner items and marks pooled items `pivot_needed` for friends via a SECURITY DEFINER existence check — owner still cannot see pool state |
| 5 | Gift-card pun behind `can()` | `gift-card-f10.md` | Spark flat `json_schema` pun generated only after `can(actor, 'card_pun')`; result cached on `gift_cards` with `model_used`; deterministic fallback stays when off/unconfigured |
| 6 | Landing no-leak test | `public-landing-page.md` | Rendered `/` HTML asserted to contain no circle identifier, slug, or contributor data |
| 7 | Screenshot strip | `public-landing-page.md`; demo checklist | Playwright captures seeded fictional-cast screens to `public/screenshots/`, landing references them; strip is build artefact, no live data |
| 8 | WhatsApp dispatch behind `can(assistant_reply)` | `whatsapp-task-bot-surface.md` | Text-task dispatch in `processIngest` asserts `assistant_reply` first; off → fixed menu + degraded copy, no state change |
| 9 | Post-event reveal F14 | `post-event-reveal.md` | The spec in that file, unchanged: date gate, author veto, guarded transition, 404-not-403, no notification |

## Order

1 (security) → 6 (possibly already covered — verify before writing) → 3, 2 (quick) → 5 → 4
(migration, highest care) → 9 → 8 → 7.

## Never

No RLS disable or `LEAK_SKIP_POLICIES=1` to show red. No `prisma/schema.prisma` staging by
any parallel agent. Isolated `DATABASE_URL_TEST` only. Fictional cast only — no real names
or numbers. `/c/<slug>` does not move.
