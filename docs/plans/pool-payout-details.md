---
title: Pool payout details, amounts-due share, and pledge visibility
type: spec
status: done
priority: P1
rank: 6
updated: 2026-10-28
apps: []
related: [SPEC.md, ARCHITECTURE.md, src/server/ledger/index.ts, src/server/views/index.ts]
evidence: ''
archived_date: null
supersedes: null
evidence: 'Shipped on main 2026-10-28: pool_payouts table + RLS (buyer-write, pledger-read-if-shared-and-pledged, owner-blind), savePayout/markPaidFor/payoutReference in ledger, gated view fields (myContribution, pledged, payout, buyer tally), /pay share page with wa.me link, own-pledge feedback on the item page. Gates: full vitest 553/553, leak 175/175, typecheck 0, browser circle.spec 11/11 incl. chip-click shows Your pledge.'
---

# Pool payout details, amounts-due share, and pledge visibility

## Problem

Tapping a chip-in preset (R100 / R250 / R500) records a pledge and 303-redirects,
but the friend sees zero change: their own pledge is hidden ("Your own pledge and
payment status are not shown here") and the pool meter only counts `settled` money,
which stays R0 until the buyer records the purchase. Verified at the route layer:
chip posts return 303 and write the contribution; there is no server-side chip bug.
The defect is invisible feedback. The fix is visibility plus the payout feature below.

## Scope

1. **Buyer payout details per pool** (`pool_payouts`, one row per pool): account
   holder, bank name, account number, branch code, optional reference prefix, and
   an explicit `share_consent` toggle. Buyer-only write; buyer can always read
   their own row.
2. **Gated visibility**: a pledger sees the payout details only once they have a
   contribution on that pool AND the buyer switched sharing on. The owner never
   sees payouts, pledges, or paid states (no owner read policy — blind by absence;
   owner view and owner HTML unchanged).
3. **One-click share**: a no-JS pay page per pool item rendering a copyable
   payment text (bank details + every pledger's display name, amount due, and
   payment reference) plus a `wa.me/?text=` link so it lands in WhatsApp in one tap.
   Viewable by the buyer and by pledgers (same gate as the details).
4. **Mark paid**: pledgers self-mark (existing); the buyer may mark any pledger's
   contribution paid (new `markPaidFor`, buyer-only).
5. **Pledge feedback**: the item page shows the viewer their own pledge
   (amount + paid state), the pledged total next to the settled total, and — for
   the buyer — the per-pledger tally with paid states. The friend ledger list
   keeps its rule: settled only, no headcount there.

## Non-goals

- No money movement, no payment provider, no card/bank API. Manual EFT only.
- No change to owner projections, `/c/<slug>` stability, or the assistant's tasks.
- References are deterministic (`PN-XXXXXX` from the contribution id); no new
  randomness or model calls.

## Contract

- Migration is expand-only: new table + nullable column, defaults keep the old
  image running. `pnpm db:policies` must still report every table protected.
- New intents reuse the item POST route: `save_payout` (buyer), `mark_paid`
  gains an optional `userId` (buyer-only for others), share page is a GET.
- Tests: route tests for chip payloads (303 + correct minor), payout CRUD +
  visibility matrix (stranger/pledger/buyer/owner), a leak test asserting owner
  HTML carries no payout, pledge, or reference bytes, and a browser chip-click
  asserting the pledge becomes visible to the pledger.
