---
title: Owner circles return home — login, multi-circle dashboard, navigate back
type: spec
status: ready
priority: P0
rank: 4
updated: 2026-11-04
apps: []
related:
  - docs/plans/otp-return-path.md
  - docs/plans/archive/shared-registry-and-circles.md
  - docs/plans/ux-owner-date-and-nav.md
evidence: interview 2026-11-04 (landing login; gifts for you vs others; email+share links; ship to live pinata)
archived_date: null
supersedes: null
superseded_by: null
---

# Owner circles return home

Interview SPEC (2026-11-04). Implementation happens in a **fresh session** against this
file. Email OTP mechanics remain owned by [`otp-return-path.md`](otp-return-path.md);
this plan owns landing → login → multi-circle home → open circle → back, including
closing gaps for owned, member, and proxy-created circles.

## Problem

On the live site there is no clear way for a returning person to reach **all** of their
circles and registry without creating another circle. The hub still pushes create, and
“Open my circle” (singular, paste-link) neither proves ownership nor supports multiple
circles (e.g. one with parents, one per friend group). People also need a home that
clearly separates **gifts for you** from **gifts for others** (friend memberships and
proxy circles they started), then navigate into any of those and back.

## Success criteria

- From the **landing page**, a signed-out person can start **My circles** → email/phone
  find → code verify → land on `/app` **without creating a circle**.
- `/app` (signed-in) shows two groupings:
  - **Gifts for you** — active circles where this user is the recipient/owner of their
    own wishlist circle(s).
  - **Gifts for others** — active friend memberships **plus** proxy circles this user
    created for someone else.
- A user may own **multiple** receive-circles; all appear under Gifts for you.
- Registry section appears only for sessions that may manage a canonical registry
  (owner path); friends never see the registry half.
- From any opened circle, **brand/Home** and side-menu **All circles** return to the
  `/app` dashboard when signed in.
- Hub paste-link `/app/open` is **removed**; signed-out `/app` offers create + open via
  find; signed-in `/app` is the dashboard (create via “Start another”).
- Playwright (CI) proves the return path without create; after deploy, one **live smoke**
  on pinata confirms landing → find → verify → dashboard → open → back.
- Uniform OTP find/verify behaviour (hit/miss indistinguishable) remains intact.

## Failure criteria

Hard failure → **refuse to ship** (or roll back image):

- Owner HTML / dashboard shows claim, pool, or contributor money state. **Response: refuse.**
- Find/verify status, wording, body shape, or latency differs for hit vs miss. **Response: refuse.**
- Signed-in user cannot return to `/app` from a circle without the share link.
  **Response: refuse.**

Warn / fix before ship:

- Dashboard lists a circle the session cannot open (link 404 or wrong projection).
  **Response: warn → fix.**

Soft / acceptable for v1:

- Live Resend From not configured yet (`DEMO_MODE=on`); UI + session path still work.
- Friends with no email on file return only via `/c/<slug>` (no forced email capture).
- Circle side menu stays a flat switcher; for-you / for-others headings live on the
  dashboard only.

False success (does **not** count as done):

- Hub still exposes paste-link `/app/open` as the only “open” path.
- OTP works but lands only in one circle and never shows the multi-circle home.
- Dashboard exists only for `session.role === 'owner'`, so pure friends with email never
  see their member list.

## Decisions & rationale

- **Decision:** Landing primary return CTA is **My circles** → `/app/find` (not paste-link).
- **Why:** Paste-link is not ownership proof; “Open my circle” implies one circle and
  contradicts multi-circle ownership (parents vs friend groups).
- **Alternatives rejected:** Keep `#open-my-circle` paste (today’s dead end); dual Log in +
  Paste in the hero (crowds CTA, revives fake owner-open).
- **Status:** decided
- **Revisit if:** analytics show owners only ever have the WhatsApp link and never stored email.

- **Decision:** Find title / verify button copy use plural **Open my circles**.
- **Why:** Matches multi-circle home and Q11 correction.
- **Alternatives rejected:** “Log in” account language; singular “Open my circle”.
- **Status:** decided
- **Revisit if:** brand pass prefers “Sign in” after first external users.

- **Decision:** Signed-out `/app` = create + find entry; signed-in `/app` = dashboard only
  (create via Start another / `/app/new`).
- **Why:** One door, two shapes; avoids accidental second create after login.
- **Alternatives rejected:** Always show create forms; find only at `/app/find` with
  create-only hub.
- **Status:** decided
- **Revisit if:** 390px hub becomes too crowded (shared-registry Q7 revisit).

- **Decision:** Email OTP eligibility = any user with email who owns ≥1 active circle,
  has ≥1 active friend membership, **or** created a proxy circle; ignore
  `circles.discoverable` for this path. Friends without email keep share links only.
- **Why:** Home must list owned and member circles; discoverable gate would force owners
  back to the link (otp-return-path follow-up).
- **Alternatives rejected:** Owners only; discoverable-only owners.
- **Status:** decided
- **Revisit if:** friend email capture becomes a product requirement.

- **Decision:** After verify, issue session scoped to a home circle for RLS, but **always
  redirect to `/app`**; opening a circle updates session context.
- **Why:** Multi-circle home is the product; skipping it is false success.
- **Alternatives rejected:** Redirect into most-recent ledger only; session with no
  circle until pick (breaks circle-scoped actor patterns).
- **Status:** decided
- **Revisit if:** actor/session model gains a true “user-only” scope without circle id.

- **Decision:** Dashboard groupings use labels **Gifts for you** / **Gifts for others**;
  proxy-created circles sit under **Gifts for others** even without a friend membership.
- **Why:** Plain words; “buy in” misses planning-for-someone; matches how people think.
- **Alternatives rejected:** Three lists; badge-only single list; “receive in / buy in”.
- **Status:** decided
- **Revisit if:** users confuse proxy-planning with friend buying and need a third list.

- **Decision:** Empty sections still render with short empty copy; archived/inactive
  circles omitted (active only).
- **Why:** Empty sections teach the model; active filter already matches branch queries.
- **Alternatives rejected:** Hide empty sections entirely.
- **Status:** decided
- **Revisit if:** empty copy feels noisy when both lists are empty for new sign-ins.

- **Decision:** Side menu remains flat (all accessible circles + All circles → `/app`);
  brand/Home → `/app` when signed in.
- **Why:** Headings on dashboard only (soft acceptance); Home round-trip is a hard failure if missing.
- **Alternatives rejected:** Split headings in the side menu; brand → marketing landing.
- **Status:** decided
- **Revisit if:** people never leave a circle to switch and need split in-menu.

- **Decision:** Ship via feature branch → PR → required CI → deploy; rollback = previous
  image tag; **no feature flag**. Live Resend From remains an ops gate, not a product gate.
- **Why:** No protected external traffic; flag doubles projection tests.
- **Alternatives rejected:** `OWNER_RETURN` env flag; ship OTP without dashboard regrouping.
- **Status:** decided
- **Rollback path:** previous `pinata-app` image tag + unchanged DB (expand-only schema).
- **Deploy order:** OTP/schema already on branch → hub/landing/dashboard/nav → browser
  tests green → merge/deploy → live smoke. Verify find/create routes on Caddy `@app`
  (`/app/*`), not only `/app`.
- **Idempotency:** OTP codes single-use, attempt-limited (existing); find always uniform
  whether or not a code was issued.
- **Revisit if:** first real external cohort needs a kill switch.

- **Decision:** This file is the implementation queue entry; `otp-return-path.md` keeps
  email send/security non-negotiables; hub/landing/dashboard IA and multi-circle home are
  owned here.
- **Why:** Plans index visibility; avoid forking OTP security rules.
- **Alternatives rejected:** Only edit otp-return-path; root-only SPEC with no plans row.
- **Status:** decided
- **Revisit if:** OTP plan and this plan drift on eligibility or redirects.

## User flows

1. **Return (signed out):** Landing → **My circles** → `/app/find` → enter email or phone →
   uniform “code on its way” → enter code → `/app` dashboard.
2. **Home scan:** See **Gifts for you** and **Gifts for others** (empty copy if needed);
   registry block only when allowed; **Start another circle** available.
3. **Open owned:** Open under Gifts for you → owner ledger for that slug → Home / All
   circles → `/app`.
4. **Open other:** Open under Gifts for others (membership or proxy-created) → correct
   friend/proxy projection → back to `/app`.
5. **Friend without email:** Still opens `/c/<slug>` from the shared link; no dashboard
   until they have an email on file and complete find.
6. **First-time create (unchanged spine):** Landing → Start your circle → signed-out hub
   create → session → can later return via find.

## Out of scope

- WhatsApp OTP / authentication templates
- Forcing friends to add email
- Discoverable toggle UI / post-create discoverable editor
- Cross-email identity merge
- Live Resend From DNS as a blocker (demo OTP acceptable until operator configures From)
- Redesign of create or proxy lookup beyond wiring them into the return path
- Claim/pool mechanics, card delivery, vision/SAM changes

## Open questions

None from the interview. Implementation may surface `[TODO: needs clarification]` only if
live schema diverges from `proxy_created_by_user_id` / membership queries assumed here.

## Implementation steps

1. **Wire entry surfaces** — Landing CTA **My circles** → `/app/find`; remove hub
   paste `/app/open` and `#open-my-circle` paste form; signed-out hub third panel points
   at find with plural copy (`src/components/screens/landing.tsx`, `hub.tsx`, `find.tsx`).
2. **Session-aware `/app`** — Signed-out hub vs signed-in `DashboardScreen` (extend
   `src/server/routes` hub/registry/otp as needed); verify always `303` → `/app`.
3. **Dashboard data** — Extend `loadDashboard` (`src/server/views/dashboard.ts`) so
   **Gifts for others** includes `proxyCreatedByUserId = me` active proxy circles as well
   as friend memberships; **Gifts for you** = owned receive circles; empty-section copy;
   labels per Decision A.
4. **OTP eligibility** — Align find/issue path with owners **or** members **or**
   proxy-creators who have email (`src/server/routes/otp.ts` / ledger otp); keep uniform
   responses and floors from otp-return-path.
5. **Navigation** — Ensure circle shell Home + `CircleMenu` **All circles** use signed-in
   `/app`; keep flat side-menu list (`circle-menu.tsx`, screen shells, CR-UX-05 behaviour).
6. **Tests** — Unit/route: uniform OTP; dashboard groupings; no money state on owner
   dashboard HTML. Playwright: landing → find → verify → both sections → open → back
   **without** create. Friend-with-email member-only session sees others list, no registry.
7. **Ship** — PR from `feat/email-otp-sign-in` (or successor), CI green, deploy pinata,
   live smoke; confirm Caddy `@app` includes `/app/*`. Document smoke result in plan
   evidence.

## Guardrails (carry into implementation)

- No model/spend path without `can()` (unchanged product rule).
- `/c/<slug>` never moves.
- Number lookup still always 200 / uniform (not this feature’s door).
- Plain words only on screen; Paper Fiesta / `DESIGN.md` for any visible change.
- Do not commit real phones, names, or gift conversations.
