# Item detail screen output

## Owned files and delivery

Only these files were written:

- `C:/Users/apsch/Documents/personal/gifts-registry/src/components/screens/item-detail.tsx`
- `C:/Users/apsch/Documents/personal/gifts-registry/tests/screens/item-detail.test.tsx`
- `C:/Users/apsch/Documents/personal/gifts-registry/docs/operations/parallel-agent-outputs/item-detail.md`

Exports `ItemDetailScreen({ item: FriendItemView, basePath: string, notice?: string })`. This is a friend-only presentation component, not an authorization boundary. The parent must exclude the owner before rendering it.

Read `DESIGN.md`, `ARCHITECTURE.md`, `src/server/views/index.ts`, and the installed `frontend-design/SKILL.md` and `accessibility-audit/SKILL.md`. Reused the real `Screen`, `Panel`, `Button`, `Field`, and `Badge` API from `src/components/ui.tsx`; no UI mocks or replacements were added. Shared fields generate associated labels/hints and native number constraints. Shared V7 styling supplies pink human panels, blue money panels, the explicit purchased-state green wash, tabular amounts, and visible focus. No cursive, new styling system, browser finance, model calls, automatic transitions or fake success notices.

- Shows supplied title, optional retailer/price, secret/suggestion/claim indicators, pool target, settled total, pool status and contribution-record count. No contributor identities are invented.
- Tombstones and `pivot_needed` remain visible with reasons and explicit copy that records survive, and no refund or money movement happens automatically.
- New commitments stop on inactive gifts or pivots. Pool contributions require `open`; mark-paid requires an active `open`/`funded` pool; purchase requires an active `funded` pool and `iAmBuyer`.
- Release is offered for my claim only when no pool is projected, matching the backend's solo-only release. An inactive solo claim can still be released.
- Card link is always `${basePath}/items/${item.id}/card`; copy directs a human to hand it over. The link neither generates nor sends a card.
- Optional supplied notices render as escaped alerts. No notice or completed-state message is synthesized from a submit click.

## POST payload contract

All forms POST natively to `${basePath}/items/${item.id}`. Each has one hidden `intent` and an explicit submit button. The shared Button API does not accept `name`/`value`, so hidden intent fields are used rather than silently dropping submitter attributes; they also survive keyboard submission.

| Intent | Other FormData fields | Visible when | Backend dispatcher target |
| --- | --- | --- | --- |
| `claim` | none | active gift, no pool, not claimed by me | `claimItem(tx, actor, itemId)` |
| `release` | none | claimed by me, no projected pool | `releaseClaim(tx, actor, itemId)` |
| `create_pool` | `targetMinor`, `currency=ZAR` | same availability as claim | `createPool(tx, actor, itemId, targetMinor)` |
| `contribute` | `poolId`, `amountMinor`, `currency=ZAR` | active gift, open pool | `contribute(tx, actor, poolId, amountMinor)` |
| `mark_paid` | `poolId` | active gift, open/funded pool | `markPaid(tx, actor, poolId)` |
| `purchase` | `poolId` | active gift, funded pool, assigned buyer | `purchasePool(tx, actor, poolId)` |

The amount inputs are labelled **Pool target (ZAR cents)** and **Your contribution (ZAR cents)**, with `type=number`, `required`, `min=1`, `step=1`, no fabricated defaults, and the fixed example “10000 means ZAR 100.00”. FormData amounts are strings: the parent must validate positive integers within the database range and reject unsupported currency before calling the services. There is no parsing of formatted prices, conversion to/from rand, summing, progress calculation, or remaining-amount calculation in this screen.

Dispatcher names and guards were checked against the backend worker's actual `src/server/ledger/index.ts` as it arrived. The services are not imported or executed by the screen. The parent must derive actor/user identity from the authenticated session, validate Origin/CSRF, bind submitted `poolId` to the URL item and circle, and apply authoritative lifecycle/reservation/payment guards. No `userId`, `contributionId`, status, paid total or buyer flag is posted. Use refreshed projections and a 303 after successful mutations; do not turn a rejected service operation into a success notice.

## Actual red/green and type evidence

All executed assertions render the public export through `ReactDOMServer.renderToStaticMarkup` with literal fictional `FriendItemView` fixtures. No DB/global setup, service or UI mocks were used.

1. Wrote the test suite first, then an empty public screen returning `null`: **12 tests executed, 12 assertion failures**, exit 1. The pivot and buyer tests failed on missing visible content, not missing imports.
2. Implemented against the real shared primitives: **12 passed**, exit 0. Adjusted integer-input checks to be independent of React's attribute ordering while preserving every constraint.
3. Checked solo-only release against the arriving backend and added regressions: **15 executed, 2 failed / 13 passed**, exit 1; after the release guard correction, **15 passed**.
4. Tightened open-contribution/funded-purchase expectations before changing the screen: **15 executed, 2 failed / 13 passed**, exit 1; after correction, **15 passed**.
5. Checked the completed mark-paid backend and added inactive/pivot payment regressions first: **17 executed, 4 failed / 13 passed**, exit 1. After correction, **17 passed**, exit 0; the final post-styling recheck passed all 17 tests in 25 ms test time, 266 ms total.
6. Scoped TypeScript compilation of the owned screen/test and their transitive imports passed with `noEmit: true` and `incremental: false`. Rechecked after the final styling change: still passed. No build metadata was written.
7. Full `tsc --noEmit --incremental false` returned exit 2 at the time checked, with four unrelated diagnostics: `C:/Users/apsch/Documents/personal/gifts-registry/src/server/cards/render.ts:77` (`fontBuffers`), and `C:/Users/apsch/Documents/personal/gifts-registry/tests/cards/render.test.ts:56`, `:60`, `:72` (render argument, `bleedMm`, optional entry fields). No item-detail diagnostics; these files were left untouched.

Final isolated test command actually used, from the repository working directory:

```bash
ELECTRON_RUN_AS_NODE=1 "C:/Users/apsch/AppData/Local/Programs/Qoder/Qoder.exe" --input-type=module -e 'import { startVitest } from "file:///C:/Users/apsch/Documents/personal/gifts-registry/node_modules/vitest/dist/node.js"; const root = "C:/Users/apsch/Documents/personal/gifts-registry"; const ctx = await startVitest("test", ["tests/screens/item-detail.test.tsx"], { root, config: false, watch: false, run: true, include: ["tests/screens/item-detail.test.tsx"], globalSetup: [], maxWorkers: 1, fileParallelism: false, reporters: ["default"] }, { resolve: { alias: { "@": root + "/src" } } }); await ctx.close();'
```

This uses an in-memory runner configuration to avoid the repository's database global setup. At initial inspection the repo runner also excluded `.tsx`; no repository configuration was changed by this worker.

## Missing projection seams and parent integration limits

- **My contribution is absent.** `FriendItemView` has no own amount, currency, contribution ID/status, or paid timestamp. The screen explicitly says “Your contribution amount and payment status are not shown here” and asks users to mark paid only after an existing pledge and an external payment. It cannot hide already-paid/contributed actions accurately or populate an existing amount. A future friend-only `myContribution` projection should carry authoritative amount/currency/status; never expose it to the owner. Until then, the backend uniquely finds the authenticated user's contribution and may reject a missing/conflicting one.
- **Settled is not marked paid.** The current builder sums only `settled` records; backend funding is based on `marked_paid` records. Therefore a funded pool can legitimately show `R0.00` settled. No “you paid”, paid total, pledged total, percentage, remaining balance or funded inference is fabricated. A marked-paid total, if desired, needs its own explicitly labelled friend projection.
- **Purchased history is filtered out.** `friendCircleView` selects the first pool whose status is not `purchased`, and `claimedByMe` includes only currently claimed records. It drops purchased pools/fulfilled claims, so the current projection cannot reliably show a completed gift or prevent offering a claim on an already purchased item. The screen handles an explicitly supplied purchased pool, but does not invent that state when `pool` is null. Parent needs a friend-only completion/reservation seam if that state should remain visible.
- **Availability and claim kind are incomplete.** No confirmation flag, other friends' reservations, or own claim kind is projected. The UI never labels an item “Unclaimed”; availability copy says the server checks it. Release is conservatively hidden when a pool exists, because pool-member claims are not solo releases. A friend-only claim-kind/availability or allowed-intents projection would make this precise.
- **Pool currency is not projected.** v1 forms explicitly use ZAR as requested; a non-ZAR pool cannot be safely supported by these formatted strings alone. Backend currency checks remain authoritative.
- **Route/privacy verification is parent-owned.** Never mount this screen on an owner branch. Item/card GET and POST handlers must independently authorize, return indistinguishable 404s for unauthorized callers, and set private/no-store cache controls. Card routes must suppress OG/social previews, use noindex, enforce gift-giver/completed-gift eligibility, and never notify/send automatically. The current card link is navigation, not proof of eligibility or route implementation.
- **RLS lifecycle blockers are not UI fixes.** The backend worker's actual ledger tests identify `ledger_policy_blocked:item_lock` on readable owner-authored items. A rendered POST form is not proof that the underlying RLS write works; do not mask these errors or change policies in this screen task.
- Reviewed the actual shared stylesheet `C:/Users/apsch/Documents/personal/gifts-registry/public/pinata.css`: focus-visible has a 3px outline, and the consumed panel/amount/layout classes are present. This worker did **not** run a browser, screenshot, keyboard/reflow/zoom check, axe scan, assistive-technology session, live POST, database transition suite or authenticated owner-leak suite. Static rendering and stylesheet inspection are not a WCAG or end-to-end privacy certification.

No views, routes, services, packages, configuration, secrets or Git operations were changed. The three assigned files remain uncommitted for parent integration, as requested.
