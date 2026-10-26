---
title: User management, the path to paid, and which open source to adopt
type: reference
status: ready
priority: P2
rank: 8
updated: 2026-10-26
apps: []
related: [SPEC.md, ARCHITECTURE.md, docs/plans/entitlements-and-capability-gate.md, docs/plans/whatsapp-task-bot-surface.md, docs/plans/gift-circles-ten-day-build-plan.md, AGENTS.md]
evidence: 'Built: src/server/auth/session.ts + src/server/routes/circle.ts + tests/routes/circle-link.test.ts (18 tests, commit f518b8a). Research verified 2026-10-26 against vendor docs; every load-bearing claim below carries its source.'
archived_date: null
supersedes: null
superseded_by: null
---

# User management, the path to paid, and which open source to adopt

**Status:** Three questions asked on 26 Oct, answered here as decisions rather than as prose in a chat that will be
compacted. The framing that drove them — *"post-hackathon thoughts, but the architectural decisions have to be made
early to avoid refactoring"* — is the reason this file exists: the answer for each is either **build the seam now and
the thing later**, or **never build the thing**.

Everything dated. Vendor availability changes; a decision recorded without its verification date is a decision nobody
can trust in six months.

## Problem

The product has no password, no email address, and no browser-first signup. A person exists because they messaged a
WhatsApp number, or because the circle owner wrote their phone number onto an invite list. Any identity or billing
system that assumes an email-and-password signup is the wrong shape and would have to be torn out. At the same time,
the free/premium split has to be reachable from where the code stands today without a migration that rewrites the
privacy model.

## Decisions & rationale

### D1 — Identity is hand-rolled; the web session is a signed cookie and nothing else

- **Decision:** a person is a `users` row keyed on `bsuid` (primary) or `phone_e164` (fallback). The browser half gets
  an HMAC-SHA256-signed httpOnly cookie over `{v, userId, circleId, role, exp}`, keyed with the existing
  `SESSION_SECRET`, 14-day expiry. No auth framework. Built in `src/server/auth/session.ts`.
- **Why:** the credential is *"Meta already verified this BSUID on an authenticated WhatsApp thread"* or *"this person
  proved possession of an allow-listed number"*. No library models either. Every candidate either ignores WhatsApp as a
  delivery channel or owns identity tables queried through its own connection — which would put an unscoped identity
  path alongside a privacy model that assumes exactly one scoped path (`withActor`).
- **Alternatives rejected:**
  - **Better Auth** (MIT) — has a `phone-number` plugin, but delivery is a custom `sendOTP` callback, so the WhatsApp
    sending is still ours; and it **requires** core `user` / `session` / `account` / `verification` tables. Names are
    configurable, ownership is not. It has no notion of `app_owned` / `app_friend` role switching, so it would need a
    role that bypasses RLS.
  - **Auth.js / NextAuth v5** (ISC) — no phone-OTP support; only a generic Credentials provider, and Credentials
    **cannot use database sessions** (JWT only). Net effect: a JWT-cookie wrapper around logic we still write ourselves.
  - **Supabase Auth** (Apache-2.0) — supports WhatsApp OTP but only via Twilio / Twilio Verify, or a Send-SMS hook.
    Disqualified on structure: it owns `auth.users` in *its* Postgres, so identity stops flowing through `withActor`.
  - **Clerk** — the only managed option with a native `channel: 'whatsapp'` for phone-code OTP, but hosted, proprietary,
    outside our Postgres, and WhatsApp-channel pricing unverified.
  - **Auth0 / WorkOS** — no native WhatsApp; Auth0 needs Custom Phone Provider Actions wired to Twilio or a marketplace
    vendor. WorkOS WhatsApp-OTP unverified.
- **Cost of the decision:** ~120 lines including the cookie attributes, versus a dependency whose value proposition we
  would not use.
- **Status:** decided and built. 18 tests, three of them proven red first.
- **Revisit if:** we need browser-side OAuth, multi-device session listing/revocation, or SSO. Better Auth is the
  candidate (MIT); by then its table-ownership requirement is worth a real migration rather than a workaround.

### D2 — `SameSite=Lax` is a product requirement, not a default to fiddle with

- **Decision:** the session cookie is `SameSite=Lax`, `HttpOnly`, `Secure` in production.
- **Why:** the link arrives as a **top-level GET navigation out of WhatsApp's in-app browser**. `Strict` drops the
  cookie on that navigation, so every shared link would render logged-out on the product's only distribution channel.
  A test asserts `Lax` is present and `Strict` is absent, because the failure mode is silent and looks like a database
  problem from the inside.
- **Alternatives rejected:** `Strict` (breaks the WhatsApp click); `None` (requires `Secure`, and is broader than the
  threat model needs).
- **Status:** decided.
- **Revisit if:** the product gains a cross-site embed, which it should not.

### D3 — Friends join through the allowlist hash; OTP is an upgrade, not a dependency

- **Decision:** `POST /c/<slug>` takes a name and a phone number, hashes the normalised E.164 with `SESSION_SECRET`,
  and matches it against that circle's `allowlist_entries`. A match that is not `removed` creates the user, upserts an
  active `friend` membership, flips `pending → accepted`, and issues the cookie. Nothing is written before the match.
- **Why:** the WhatsApp **authentication template** is always charged, takes up to 24 h to approve, and can be rejected
  outright — it is already a row in the build plan's risk register with "ship allowlist-only" as its mitigation. The
  allowlist path needs no Meta approval and works today. It also keeps the number out of storage as digits: the
  allowlist holds only the keyed hash.
- **Alternatives rejected:** OTP-first onboarding (blocked on template approval, costs per message, and adds a
  rate-limit surface); magic links by email (there are no email addresses).
- **Status:** decided for the hackathon; provisional for after it.
- **Revisit if:** the authentication template is approved *and* we want self-serve joining without the owner
  pre-adding every number. Then OTP becomes the second door, not a replacement.

### D4 — The owner's session is an open gap, and it is recorded here rather than discovered on day 9

- **Decision:** unresolved. The owner is not on their own allowlist, and the seeded demo cast deliberately contains
  **no phone numbers at all**, so the owner cannot use the phone gate.
- **Why it is open:** the owner's natural credential is the BSUID from the WhatsApp task bot, which is
  `docs/plans/whatsapp-task-bot-surface.md` (day 6+). Building an owner-specific web login now would be a second door
  with its own failure modes, two weeks before it is needed.
- **Interim for the recording:** the operator mints the owner's cookie with a local script that calls
  `issueSession({ userId, circleId, role: 'owner' })`. That is a build-time tool run on the operator's own machine,
  **not** a deployed endpoint — there is no route in this app that mints a session for anyone who has not passed the
  allowlist check. Decide between "bot path" and "minted cookie" with the cast decision on day 7, not on day 9.
- **Status:** open.
- **Revisit if:** the task bot lands first (likely), which closes it properly.

### D5 — No payment integration before submission. Paddle is the post-hackathon merchant of record.

- **Decision:** for the nine days to submission, **build nothing**. `users.plan` and `entitlements.source =
  'subscription'` already reserve the seam, and the seeded cast is `internal` so the recording never meets a tier wall.
  After submission: **Paddle** as primary merchant of record; **Paystack subscriptions** later only if a ZAR local rail
  is wanted.
- **Why:** **Stripe does not onboard South African entities.** `stripe.com/global` lists South Africa only under an
  "Extended network" badge whose href is `paystack.com/stripe/south-africa` — a ZA entity registers with Paystack, not
  with Stripe (verified 2026-10-26 by pulling the raw HTML, not the rendered page). Separately: MoR KYC approval alone
  takes days to weeks, and billing is not demo-judgeable against a rubric of Impact 30 / Meta tooling 25 / Technical
  depth 20 / Demo 25.
- **The tax case, which is the actual reason to buy rather than build:** ZA's compulsory VAT threshold is R2.3m per 12
  months from 1 Apr 2026 (SARS), so domestic VAT is not the problem. Selling direct to consumers abroad is — EU digital
  B2C has **no** registration threshold for non-EU sellers (non-Union OSS), the UK requires registration "regardless of
  taxable turnover" for overseas sellers, and US states have post-*Wayfair* economic nexus. A merchant of record absorbs
  all three. A solo dev registering for VAT in three jurisdictions to charge R99 a month is the definition of wasted
  effort.
- **Alternatives rejected:**
  - **Polar.sh** — MoR, but payouts go *"to your Stripe account"*, which makes it effectively unavailable to a ZA
    resident.
  - **Lemon Squeezy** — Stripe-owned, ZA appears in its supported bank-payout countries, and it is MoR, so it is the
    viable backup. Rejected for now because it is mid-migration to "Stripe Managed Payments" (its own Jan 2026 update),
    which is the wrong moment to build on it.
  - **Paystack** — serves ZA businesses and has a Subscriptions/Plans API, but international cards are "charged and
    settled… in your local currency" (ZAR), so there is no USD pricing, and it is **not** MoR — the tax problem stays
    ours.
  - **Stripe Atlas US LLC / UK Ltd** — unlocks Stripe Billing and 135+ currencies, but adds an entity, Form 5472 and
    bookkeeping. Only worth it if gift-pool payouts later force Stripe Connect, at which point one US entity serves
    both.
  - **Flutterwave / Peach Payments / Netcash** — recurring and ZA-capable, ZAR-centric, not MoR.
  - **Yoco** — no native recurring; needs a third-party wrapper.
  - **PayPal** — Subscriptions API exists but ZA receiving for subscriptions is unverified. Secondary rail at best.
- **Status:** provisional. The **timing** is decided (nothing before 4 Nov); the **provider** is not contracted.
- **Revisit if:** Stripe opens ZA directly; Lemon Squeezy finishes its Stripe migration and undercuts Paddle; or
  gift-pool payouts force a US entity anyway, which would make Stripe Billing the cheaper second step.

### D6 — The billing schema, decided now so it is additive later

- **Decision:** when billing lands it is four new tables and no rewrite: `plans` (code, `price_minor`, currency,
  interval), `subscriptions` (`user_id`, `plan_id`, provider, `provider_subscription_id`, status including `past_due` /
  `paused`, `current_period_end`, `cancel_at_period_end`, `trial_end`, `grace_until`), `billing_customer` (`user_id`,
  provider, `provider_customer_id`), and `webhook_events` for idempotency. The provider is the source of truth;
  `users.plan` is a **derived cache**. This matches the shape Paddle and Stripe integration guides use.
- **Why the cache is safe — and the one way it is not:** `users.plan` read inside an RLS transaction alongside
  `entitlements` is only consistent if a single writer updates both together. So the webhook handler must be the **only**
  writer of `users.plan`, and it must write `plan` and the `entitlements` rows in **one transaction**. Written
  separately, a request can land between the two and see a premium plan with free capabilities — or the reverse. That is
  the footgun, and it is a transaction-boundary problem, not a schema problem.
- **Deliberately not built:** proration math, refund tables, tax-ID storage (an MoR owns those; keep the invoice JSON at
  most), multi-seat. Single-seat is correct for this product.
- **Migration rule:** expand-only, per `AGENTS.md` — the previous image tag must still run against the new schema.
- **Status:** decided as a shape. Not scheduled, not started.
- **Revisit if:** gift-pool payouts arrive, because then `connect_accounts` and payout state are a separate concern from
  subscriptions and must not be folded into `billing_customer`.

### D7 — Open-source billing layers: skip all of them

- **Decision:** no self-hosted billing engine.
- **Why:** **Lago** is AGPL-3.0 (network copyleft in a public repo, and overkill for one flat tier). **OpenMeter** is
  Apache-2.0 but metering only — we have seven booleans, not usage curves. **Kill Bill** is Apache-2.0 and self-hostable
  but is a full billing platform, which is a massive overkill for `free | premium`. Vendor SDKs (`paddle-node-sdk`,
  Polar's JS SDK) are sufficient when D5 lands.
- **Status:** decided.
- **Revisit if:** metered pricing becomes the model, at which point OpenMeter is the least-bad option.

### D8 — Adopt `whatsapp-api-js`; never adopt an unofficial WhatsApp client

- **Decision:** adopt **`Secreto31126/whatsapp-api-js`** (MIT, v6.3.0 released 2026-09-21, pushed 2026-10-26,
  TypeScript-native). It covers sending text/media/interactive/template messages, webhook GET-verify plus POST-parse
  with the `x-hub-signature-256` HMAC check, media download by media-id, and the 24-hour-window and template concepts.
- **Why a library rather than ~200 lines of `fetch`:** webhook signature verification and media-id retrieval are the
  two places where a subtle bug is a **security hole** rather than a cosmetic one — an unverified webhook is an
  unauthenticated write path into the ledger, and a media fetch that trusts the id without re-checking the circle is a
  cross-circle read. Everything else in the integration is genuinely 200 lines.
- **Never adopt:** `wwebjs/whatsapp-web.js` (Apache-2.0, 22.8k stars), `WhiskeySockets/Baileys` (MIT, 11.5k stars),
  `open-wa/wa-automate-nodejs` (custom licence), `wppconnect-team/wppconnect` (custom licence),
  `evolution-foundation/evolution-api` (custom licence). All of them drive WhatsApp Web or reverse-engineer the
  multi-device protocol, which violates the WhatsApp Business Solution Terms — wwebjs's own README states *"WhatsApp
  does not allow bots or unofficial clients on their platform."* The hackathon separately disqualifies platform-policy
  violations, so this is a submission risk and not a style preference. Star count is not evidence of permission.
- **Reference only:** `WhatsApp/WhatsApp-OTP-Sample-App` (MIT, pushed 2026-07-28) for the authentication-template OTP
  flow; `fbsamples/whatsapp-api-examples` (Meta sample licence, active) for snippets. `WhatsApp/WhatsApp-Nodejs-SDK` is
  **archived** (last push 2023-06-07) — do not build on it.
- **Status:** decided; not yet installed (no WhatsApp code exists yet).
- **Revisit if:** a release breaks against a Graph API version bump, at which point pinning the version and keeping our
  own signature check is the fallback.

### D9 — Meta Model API: OpenAI-compatible, so no bespoke SDK

- **Decision:** call the Model API either through the `openai` npm package (Apache-2.0) pointed at
  `MODEL_API_BASE_URL`, or with plain `fetch` + zod. No Meta-specific SDK exists or is needed.
- **Why:** Meta's own quickstart documents the Model API as *"drop-in compatible with the OpenAI SDK, the Anthropic
  SDK"* at `https://api.meta.ai/v1` with bearer auth. `src/lib/env.ts` already defaults the base URL accordingly and
  requires `MODEL_API_KEY` to start with `LLM_`.
- **Caveat, honestly stated:** this comes from one research pass reading `dev.meta.ai/docs/quickstart` on 2026-10-26,
  not from a call we have made. **Re-verify against a real `GET /v1/models` response before depending on it** — that
  call is already the day-1 exit gate in the build plan, so verification is not extra work.
- **Status:** provisional until the day-1 gate passes.
- **Revisit if:** the day-1 `GET /v1/models` call shows a shape the OpenAI SDK cannot express — particularly for
  `web_search` grounding and for flat `json_schema` structured output.

### D10 — Gift-card rendering: satori + resvg, no Chromium

- **Decision:** render the card with **`vercel/satori`** (MPL-2.0, v0.63.2, 2026-10-20) to SVG and
  **`@resvg/resvg-js`** (MPL-2.0) to PNG — or **`@vercel/og`** (MPL-2.0), which bundles both for a Next route handler
  and is the one-dependency path. `@napi-rs/canvas` (MIT) is the fallback.
- **Why:** the deploy target is a small Oracle VM. Puppeteer and Playwright are Apache-2.0 and perfectly capable, and
  shipping a Chromium binary to that box to draw an A6 card is exactly the cost to avoid.
- **Licence note, because MPL in a public repo invites the question:** MPL-2.0 is **file-level** copyleft. Using
  unmodified npm packages from an MIT/Apache repository carries no obligation; the terms attach only to modified MPL
  files. `@resvg/resvg-js`'s last *release* is v2.6.2 (2024-03-26) while the repo is still pushed to — release-stale,
  not abandoned, and it is a stable rasteriser.
- **Status:** decided; not yet installed.
- **Revisit if:** the card needs a raster effect resvg cannot do, in which case `@napi-rs/canvas` before Chromium.

### D11 — No feature-flag service. The entitlements table *is* the flag system.

- **Decision:** keep per-user capability state in the RLS-protected `entitlements` table behind `can()`. Adopt no flag
  service.
- **Why:** flags are deployment-scoped booleans; entitlements are **per-user private rows**. A flag service would have
  to evaluate them outside RLS, which means shipping user entitlement state to a sidecar — a privacy-boundary regression
  for seven booleans. The gate is also already the product's off switch: turning a capability off removes the feature
  with no redeploy.
- **Licences checked, all rejected on top of the structural argument:** Unleash **AGPL-3.0**; Flagsmith BSD-3-Clause but
  heavy (Django + Postgres + API server); Flipt FCL-1.0-MIT (fair-core, Go binary); PostHog mixed licence and huge;
  OpenFeature Apache-2.0 but only an abstraction shim over one of the above.
- **Status:** decided.
- **Revisit if:** we need rollout percentages or experiment assignment, which are deployment-scoped questions the
  entitlements table genuinely should not answer.

## Failure criteria

- **Hard failure — a session is accepted for a circle it was not minted for.** Response: refuse (gate, not content).
  Pinned by a test that was broken on purpose and went red.
- **Hard failure — the owner's HTML contains a claim, a pool, a contributor name or a message.** Response: refuse. The
  red-proof of this is the important one: routing an owner session down the friend branch *did* render the secret
  suggestion and the pool, because the owner is a member and `friendCircleView` returns rows for them. **The friend
  projection is not itself owner-blind; the route is what keeps the owner out of it.**
- **Hard failure — any `/c/<slug>` response is cacheable.** Response: refuse. One URL, two projections, so a shared
  cache is a cross-role leak that RLS cannot see.
- **Hard failure — the allowlist gate creates a user before it has authorised.** Response: refuse. Asserted by a test
  that counts `users` before and after a rejected submission.
- **Soft failure — the gate cannot be reached because the authentication template is still pending.** Response: degrade
  to allowlist-only, which is the primary path anyway (D3).
- **Non-failure — the gate markup is ugly.** It is a pre-brand placeholder. The brand round restyles the shell; the
  role split underneath is what the tests pin.
- **Detection:** `pnpm leak` (46 assertions across RLS, projections, the entitlement gate and the routes). Run red
  deliberately before trusting any new assertion in this file's area.

## Out of scope

- Gift-pool payouts, escrow, and Stripe Connect. Settlements are manual in v1; `connect_accounts` stays a separate
  concern from `billing_customer` (D6).
- Anything to do with Marketplace. Prohibited, settled, not reopenable.
- A pricing page, plan-comparison UI, metering, quotas, usage counters.
- Multi-tenant / organisation accounts, SSO, SCIM.
- The owner's web login (D4) — tracked as open, not as out of scope.

## Open questions

1. **D4, the owner session.** Bot-minted or script-minted for the recording? Decide with the cast on day 7.
2. **Does `users.phone_e164` need to stay plaintext?** It is the fallback identity and is unique-indexed, so it is
   queryable as-is, and RLS keeps it out of every projection except the roster read. Storing only a hash would make
   identity resolution across circles a lookup problem. Current answer: keep it, but it is the first thing to revisit if
   the repo goes public with a real deployment attached.
3. **Is the 14-day session TTL right for a circle whose event may be months away?** Re-clicking the WhatsApp link
   re-mints, so probably yes — but the post-event reveal (F14) happens *after* the event, and a stale cookie there
   means the reveal flow needs its own re-entry. Check when F14 is built.

## Rules to carry into `AGENTS.md`

1. Never adopt an unofficial WhatsApp client (`whatsapp-web.js`, Baileys, `wa-automate-nodejs`, wppconnect, Evolution
   API). Business Solution Terms violation = hackathon disqualification, regardless of licence or popularity.
2. Never adopt a network-copyleft or proprietary flag/entitlement service. Per-user entitlements stay in the
   RLS-protected `entitlements` table behind `can()`.

## Sources (all checked 2026-10-26)

Stripe availability: [stripe.com/global](https://stripe.com/global) · Paddle:
[supported countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle),
[supported currencies](https://developer.paddle.com/concepts/sell/supported-currencies) · Lemon Squeezy:
[supported countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries),
[2026 update](https://www.lemonsqueezy.com/blog/2026-update) · Polar:
[payouts](https://polar.sh/docs/features/finance/payouts) · Paystack:
[countries](https://support.paystack.com/en/articles/2130562),
[international payments](https://support.paystack.com/en/articles/2130690) · Tax:
[SARS VAT registration](https://www.sars.gov.za/types-of-tax/value-added-tax/register-for-vat/),
[EU one-stop-shop](https://europa.eu/youreurope/business/finance-and-tax/vat/one-stop-shop/index_en.htm),
[UK VAT registration](https://www.gov.uk/register-for-vat),
[Stripe Atlas](https://docs.stripe.com/atlas) · ZA SMS/WhatsApp rates:
[Twilio ZA SMS](https://www.twilio.com/en-us/sms/pricing/za),
[Africa's Talking WhatsApp](https://africastalking.com/chat/whatsapp),
[Twilio WhatsApp pricing change, Oct 2026](https://help.twilio.com/articles/53100480177819-Notice-Changes-to-WhatsApp-s-Pricing-October-2026) ·
Auth: [Better Auth phone-number plugin](https://better-auth.com/docs/plugins/phone-number),
[Better Auth database concepts](https://better-auth.com/docs/concepts/database),
[Auth.js credentials and database sessions](https://github.com/nextauthjs/next-auth/discussions/12848),
[Supabase phone login](https://supabase.com/docs/guides/auth/phone-login),
[Clerk SignUp object](https://clerk.com/docs/nextjs/reference/objects/sign-up) · Meta:
[Model API quickstart](https://dev.meta.ai/docs/quickstart),
[whatsapp-api-js](https://github.com/Secreto31126/whatsapp-api-js),
[WhatsApp OTP sample app](https://github.com/WhatsApp/WhatsApp-OTP-Sample-App),
[fbsamples/whatsapp-api-examples](https://github.com/fbsamples/whatsapp-api-examples),
[archived WhatsApp Node.js SDK](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/),
[Lago](https://github.com/getlago/lago)
