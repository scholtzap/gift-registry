---
title: Two dates, and a countdown that does not spoil the gift
type: spec
status: implemented
priority: P1
rank: 11
updated: 2026-10-27
apps: []
related: [SPEC.md, AGENTS.md, ARCHITECTURE.md, docs/plans/post-event-reveal.md, docs/plans/gift-card-f10.md, docs/plans/design-system-and-brand.md]
evidence: 'Asked and answered 2026-10-27 in chat: countdown is display-only, day granularity server-rendered, birthday stored month+day with year optional, and the event date may be written by the owner or by a friend. Current single-date state read from prisma/schema.prisma:197-216 and src/server/views/index.ts.'
archived_date: null
supersedes: null
superseded_by: null
---

# Two dates, and a countdown that does not spoil the gift

**Status:** Built on 2026-10-27 on `feat/two-dates-countdown`. What was built, and the four places
it departed from this spec, are at the bottom — read those before re-deriving the rules from the
table above.

## Problem

A birthday and the party for it are usually different days. `Circle` has one date
(`event_date`, `prisma/schema.prisma:201`), so the product can only know one of them. That
breaks two things at once:

1. Friends cannot wish on the actual birthday, because the app never stored it.
2. Anyone looking at the ledger sees a bare ISO string (`2026-11-18`) rendered straight from
   the column at `src/components/screens/friend-ledger.tsx:111` and
   `src/components/screens/owner-ledger.tsx:84`, with no sense of how close the day is.

The privacy half is the interesting part: if the group is organising a surprise, the person
being surprised must not learn the party date. Today that is impossible to express, because the
only writer of `event_date` is the owner who creates the circle.

## Decisions, with the reasoning

**Two dates, not one.** `birthMonth` + `birthDay` (+ optional `birthYear`) and `eventDate`.
The birthday is the day the person exists; the event is the day the gift is handed over. They
are never derived from each other, because "the party is the Saturday after" is not a rule.

**The year is optional, and its absence is the safe default.** Storing a full date of birth is
sensitive personal information, and an exact DOB lets anyone compute an age. Month and day are
enough to wish someone well and enough to render the countdown, which counts to the *event*
date and therefore has a year available anyway.

**Secrecy comes from the writer, not the field.** The owner may set their own event date (then
it is known, and rendering it to them is honest) and a friend may set it (then it is secret).
One nullable `eventDateSetByUserId` records who wrote it last; the owner projection renders the
date if and only if that writer is the owner. This was chosen over an `owner|friend` enum
because it also answers "which friend", and over a separate organizer role because the
one-owner-creates-the-link model in AGENTS.md is load-bearing for the WhatsApp distribution.

**The countdown is display only.** It unlocks nothing and gates nothing. Owner-blindness already
hides claims, pools, contributions and friend-added items, and card routes already 404 for the
owner, so a date that merely counts down adds no new path to the gift state.

**Day granularity, server-rendered.** `/c/<slug>` is raw-HTML SSR with no client JS by design
(the only URL pasted into a WhatsApp group stays framework-free). A live seconds ticker would
mean shipping a script to the most privacy-sensitive surface in the product for no gain: nothing
in this app changes on a second boundary.

## Data model

Additive and expand-only, so the previous image still runs:

| Column | Type | Notes |
|---|---|---|
| `birth_month` | `smallint` null | check `between 1 and 12` |
| `birth_day` | `smallint` null | check `between 1 and 31`; day-in-month validated in code, not SQL |
| `birth_year` | `smallint` null | optional; never required by any screen |
| `event_date` | `date` | becomes **nullable** (was required) |
| `event_date_set_by_user_id` | `uuid` null | FK to `users.id`; null exactly when `event_date` is null |

Migration backfill for rows that already exist: set `event_date_set_by_user_id = owner_user_id`
where `event_date` is not null. Only the owner could create a circle up to now, so that is
the truth for every existing row, including the seeded `nadia-30th` demo circle.

**RLS cannot do this, and that is the reason the guard sits elsewhere.** Row-level security
filters rows, never columns, and `app_owned` holds a table-wide SELECT on `circles`
(`src/server/db/policies/001_roles.sql:34`) — deliberately, because a grant with no read policy
yields zero rows and the route could no longer tell "not yours" from "does not exist". So the
owner's blindness to a friend-set date is enforced in `ownerCircleView` and *proved* by a leak
test, exactly the same way owner-blindness on `claims` is proved today. New columns inherit the
existing table grant, so no policy edit is needed.

## What each projection renders

| Field | Owner view | Friend view |
|---|---|---|
| Real birthday (month/day, year if known) | always — it is theirs | always, so wishes land on the right day |
| Event date | only when the owner wrote it | whenever it is set |
| Countdown | only when the event date is visible to them | whenever it is set |

When a friend wrote the date, the owner view shows **nothing about the event** — no date, no
countdown, and no sentence explaining the gap. Accepted risk, stated plainly: silence is
itself a signal to a person who knows the feature exists. The mitigation is that no owner-facing
copy ever mentions a friend setting a date, so an owner who did not set one reads it as "not set
yet", which is the same false-but-harmless reading the current reduced projection already gives
for claims and pools.

## Countdown behaviour

Pure function of today and `event_date`, in one fixed zone (`Africa/Johannesburg` — the product
is South African, and comparing UTC calendar days would flip the count at the day boundary for
every evening request). Rendered as a short label beside a human-readable date
("Sat 18 Nov · 12 days to go"), replacing the raw ISO string.

States: future → `N days to go`; today → `Today`; one day out → `Tomorrow`; past → `The day has
passed`. Singular/plural handled by the function, not by string concatenation in JSX.

## Write path

One native form, no JavaScript, on the existing `/c/<slug>` route surface:

- Friend ledger gets a small "When is the party" section that POSTs an ISO date.
- Owner keeps the ability to set their own date, in the same place they already see it.
- Last writer wins, and the writer is recorded. A friend overwriting an owner-set date makes it
  secret; an owner overwriting makes it known again. This is intentional and it is the whole
  model, so it needs a test in both directions.
- Validation at the boundary, like every other write here: Origin check (`isSameOrigin`),
  `YYYY-MM-DD`-shaped string parsed and range-checked, 422 re-render on failure with the value
  preserved, 303 to the ledger on success. Never a 403.

## Success criteria

Built when all of these hold, and the first four are red before the code exists:

1. `tests/leak/` gains a case: owner session, circle whose `event_date` was written by a friend →
   the rendered owner HTML contains no substring of the date, no day count, and no ISO form.
   Assert the *response body*, not the view object.
2. Same fixture with the owner as writer → the owner HTML does contain the date. Proves the rule
   is the writer, not a blanket hide.
3. Friend HTML contains both the real birthday and the event date plus countdown.
4. A `POST` of an invalid date (2026-02-30, `18/11/2026`, empty) returns 422 and writes nothing;
   a cross-origin POST is refused the same way the session-minting endpoint is (M-01).
5. Existing suites stay green with no assertion weakened: `pnpm test` (393), `pnpm typecheck`,
   `pnpm build`, and the 11 Playwright flows. The two screen tests that pin the current ISO
   string are updated to the new label, not deleted.
6. Countdown is verified against a fixed clock at three points: 12 days out, the day itself, and
   the day after. No test may depend on the machine's real date.
7. Landing page and demo seed still work; `nadia-30th` gains a birthday (month + day, no year)
   so the feature is visible in the 3-minute video without any live API.

## Out of scope

- No seconds ticker, no client JS on `/c/<slug>`.
- No reveal gating, no "unlock after the day" state, no change to owner-blindness on gifts.
- No second calendar concept (no annual reminders, no notifications — the system never notifies).
- No timezone picker; the zone is a product constant.
- No age arithmetic, no zodiac, nothing that turns an optional year into a computed secret.

## Files this touches

`prisma/schema.prisma` (+ one migration), `src/server/views/index.ts` (both projections),
`src/server/routes/circle.ts` (the POST, the projection inputs), a new pure module for the
countdown next to the views, `src/components/screens/{owner,friend}-ledger.tsx`,
`src/components/ui.tsx` if the label earns a shared primitive, `scripts/seed.ts`,
`tests/views/projections.test.ts`, `tests/routes/circle-link.test.ts`,
`tests/screens/{owner,friend}-ledger.test.tsx`, one new file in `tests/leak/`.

## Open questions

None. Settled on 2026-10-27: the friend ledger does **not** name which friend set the date.

The column still records the writer (`event_date_set_by_user_id`) because the secrecy rule needs
it, but no screen reads it for display. Naming a person on a surprise is a small spoiler risk if a
screenshot of the friend ledger reaches the owner, and nothing about coordinating the gift needs
the name.

## What was built (2026-10-27)

All seven success criteria hold. `pnpm test` 430 passed (was 393; +15 countdown, +7 leak, +9
projection/POST cases, +4 screen), `pnpm typecheck` clean, `pnpm build` clean, and Playwright is
12 flows green — the twelfth is new, see deviation 4.

- Migration `20261027150000_two_dates_and_the_countdown` (expand-only), schema, both projections,
  `src/lib/dates.ts`, `setEventDate` in the ledger, `POST /c/<slug>/date`, `DateLine` and
  `EventDateForm` in `ui.tsx`, both ledger screens, `scripts/seed.ts`.
- Red-proof: not a TDD ordering claim. After building, `ownerCircleView`'s writer comparison was
  replaced with `true` and re-run: both owner-side leak cases and the owner-blind projection case
  failed on a leaked `<time dateTime="2026-12-19">` and the leaked `value=` in the form, then
  passed again on revert. `LEAK_SKIP_POLICIES=1` deliberately does *not* turn this suite red — the
  secrecy here is a column right and dropping RLS removes only the row right under it.

**Deviation 1 — the writer CHECK is one-directional.** This spec asked for "null exactly when
`event_date` is null". The FK is `ON DELETE SET NULL`, so a two-way equality would make deleting a
friend who wrote the date fail outright. The shipped constraint is
`event_date_set_by_user_id IS NULL OR event_date IS NOT NULL`: a writer implies a date, a date does
not imply a writer. A null writer is read by `ownerCircleView` as "not the owner", which hides the
date from the owner — the safe direction for a surprise.

**Deviation 2 — the write goes through `app_set_event_date(date)`, not a friend UPDATE policy.**
RLS had no friend write policy on `circles` at all, and a policy cannot pin columns: giving friends
an UPDATE policy to enable this one field would also let them rename the circle, change
`share_slug` (the URL that must never move), archive the circle, or forge
`event_date_set_by_user_id`. The shipped path is a `SECURITY DEFINER` function that takes a date
and nothing else, sets both columns, is restricted to the session's own circle id, requires
ownership-or-membership inside the function, and is `REVOKE ... FROM PUBLIC` plus granted to
`app_owned`/`app_friend` only. It is the first *write* function in this file — `SECURITY DEFINER`
was already the established shape for the scope helpers (`app_user_id`, `app_actor_owns_circle`),
chosen for the same reason: they read tables the caller has no policy on.

**Deviation 3 — the pure module is `src/lib/dates.ts`, not beside the views.** `src/lib` is where
the project's pure, unauthenticated helpers already live (`env.ts`, `money.ts`); `src/server/views`
is the authenticated read side, and the countdown has no business reading a database.

**Deviation 4 — the browser suite grew to 12 flows.** Criterion 5 only demanded the existing 11
stay green. The extra one posts the party date with `javaScriptEnabled: false`, asserts the 303,
asserts the friend then sees `Sat 19 Dec` and a countdown, and asserts the owner sees neither the
date nor any explanation — the live proof the demo video needs, since this feature is invisible
from a view-object assertion.

Also: the owner-facing copy never mentions a friend setting a date (the hint is just "The day the
gift is handed over."), and the POST cases landed in `tests/routes/circle-actions.test.ts`, which
already owns the `post()` helper, rather than `circle-link.test.ts`.

