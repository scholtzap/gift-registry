---
title: Registry network - discovery, public visibility, and the deviations from the shipped spine
type: spec
status: draft
priority: P3
rank: 900
updated: 2026-10-27
apps: []
related: [SPEC.md, docs/plans/rn-tracks.md, docs/plans/user-management-and-billing-path.md, docs/plans/whatsapp-task-bot-surface.md, docs/plans/birthday-and-event-countdown.md]
evidence: docs/diagrams/pinata-customer-journey.drawio, docs/plans/rn-a-proxy-registry-spec.md, docs/plans/rn-d-abuse-model.md
archived_date: null
supersedes: null
superseded_by: null
---

# Registry network - discovery, public visibility, and the deviations from the shipped spine

**Status:** Draft - ledger. Records the intended journey captured 2026-10-27 and every place it departs from what
ships today. The accepted decisions are below; the work is queued in
[docs/plans/rn-tracks.md](rn-tracks.md), not here. Nothing in this ledger is scheduled ahead of the submission
spine unless RN-I says so.

**Diagrams:** [pinata-customer-journey.drawio](../diagrams/pinata-customer-journey.drawio) ·
[pinata-discovery-access.drawio](../diagrams/pinata-discovery-access.drawio) ·
[pinata-registry-network-buildmap.drawio](../diagrams/pinata-registry-network-buildmap.drawio)

## The intended flow, as stated

Search a person by WhatsApp handle or phone → see their registry → the profile owner chooses public or
invite-only → friends sign up via one constant per-person link → the link goes in a WhatsApp status or to
friends → public registries are viewable by anyone, but the viewer must log in with an OTP → registries are
findable both by on-platform web search and by the WhatsApp bot, with a permission request on either path →
import existing Meta/Facebook/Instagram friends to allow-list them.

## Decisions accepted 2026-10-27 (owner)

1. **The unguessable slug stays.** A phone number or handle is never a URL segment. A `gifts.scholtz.work/<digits>/`
   style route was considered and rejected: it puts plaintext PII in browser history, server logs, Referer headers and
   WhatsApp link previews, it makes E.164 normalisation (`078…` vs `+2778…`) a routing problem, and it turns the route
   into an enumeration oracle by construction. `/c/<slug>` never moves.
2. **The number is a lookup key, not an address.** Search by number POSTs the number; the route resolves it to a
   registry and returns a link. The digits never appear in a URL.
3. **Not-found creates a proxy registry.** A gifter can start a once-off circle for a person with **no account**, who
   is never notified and for whom no name or number is stored. Friends share one link. The circle archives some time
   after the day. This is the decision that makes the feature usable without a cold-start problem, and it **reverses**
   the "Out of scope for v1" line in `SPEC.md` quoted below - deliberately, and recorded in
   [rn-a-proxy-registry-spec.md](rn-a-proxy-registry-spec.md).
4. **The always-200 invariant.** Every lookup answers 200 whether or not the number resolves. A caller who guesses a
   number never learns whether it is registered, so the route is not an enumeration oracle.
5. **Public view still requires the door.** A public registry renders before login; anyone who wants to *act* on it
   goes through the gate (OTP once the authentication template is approved, allowlist today).

## Deviation ledger

| # | Intended | Shipped today | Gap type |
|---|---|---|---|
| 1 | One **constant per-person** registry link (`/r/<handle>`) | `circles.share_slug` is **unique per circle** (`prisma/schema.prisma:197-216`); `/c/<slug>` never moves and is per event | Model change |
| 2 | Registry is **public or invite-only** | No visibility field on `Circle` or `User`; only `AttributeVisibility` and `ItemVisibility` exist, which are item-level projections | New field + new projection rules |
| 3 | Search a friend by **phone or handle** | No search route at all; `/app` only says "use your invitation link" (`src/app/app/page.tsx:3-15`). The bot resolves a sender to *their own* one active circle (`src/server/wa/identity.ts:5-28`) and returns the fixed menu otherwise | New capability |
| 4 | Public registry viewable, **OTP to log in** | The gate is a name + keyed-hashed-number allowlist match (`src/server/routes/circle.ts:397-451`). No OTP anywhere in `src/`; no outbound template send | Blocked until template approved |
| 5 | **Request permission** on either discovery path | Allowlist rows have `pending/accepted/removed` (`AllowlistStatus`), so a *pending invite* exists, but nothing lets a stranger create one and nothing tells the owner | New flow + new inbox |
| 6 | Registry links **accessible via web search** on our platform | Every circle response sends `X-Robots-Tag: noindex, nofollow` and `private, no-store` (`src/server/routes/circle.ts:43-48`) | Policy reversal, not a feature |
| 7 | Found through the **WhatsApp bot** | Webhook, signature verification and six bounded tasks exist (`src/server/agent/tasks.ts:5`). "Find someone" and "my registries" are not among them, and free-form chat is banned on the Business Platform from 2026-01-15 | Bounded task additions |
| 8 | Owner puts the link in **their status / shares it** | Nothing sends or surfaces a share; the reveal and every notification stay a human act by rule | Stays human - do not build |
| 9 | **Import Meta/Facebook/Instagram friends** to allow-list | No integration exists | Platform-blocked, see below |
| 10 | A registry with **no account behind it** (proxy circle) | `Circle.ownerUserId` is non-nullable with a FK (`prisma/schema.prisma:211,216`), and the friend policies read `ci.owner_user_id <> app_user_id()` (`src/server/db/policies/002_policies.sql:35`) - under Postgres three-valued logic a NULL owner makes that predicate NULL, so **every friend policy fails closed** | Schema + RLS trap (rn-a, rn-c) |
| 11 | The owner signs in to manage visibility and see requests | There is **no owner session path at all**; only a friend cookie session exists (`src/server/auth/session.ts:95-108`). An owner has no way to reach their own admin surface | Missing door (rn-a-spec) |
| 12 | The lookup is rate-limited | `checkGateThrottle` (`src/server/auth/throttle.ts:10`) is imported only by `tests/routes/throttle.test.ts`: it is **never mounted**, and there is no usable key source - no `src/middleware.ts`, no `x-forwarded-for` handling, and Caddy overwrites XFF, so socket-keying collapses every user into one bucket | Unbuilt guard (rn-d, rn-b) |
| 13 | The gifter shares a **link they did not choose** | No CSPRNG slug generator exists anywhere in `src/` (`prisma/seed.ts:41` is the only slug in the repo), and `/c/<slug>` already behaves as a 404-vs-200 oracle | New primitive + existing leak (rn-b, rn-d) |

## Platform facts verified 2026-10-27 (re-verify before changing)

- **`/me/friends` returns only friends who already used this app via Facebook Login** and needs
  `user_friends`. There is no API that hands over a person's existing friend list, and Instagram has no
  contact-graph API at all. So "retrieve existing friends and allow-list them" is a cold-start loop, not an
  import. Source: [Graph API /user/friends](https://developers.facebook.com/docs/graph-api/reference/user/friends).
- **BSUIDs cannot be looked up by phone number or username** - Meta generates them, and a business only ever
  receives the BSUID of someone who messaged it. So a gifter cannot resolve "Nadia's handle" to a registry
  through Meta. Source: [Business-scoped user IDs](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/).
- **Phone numbers are omitted from webhooks** for users with a username unless the business messaged them in
  the last 30 days, which is the same constraint that already made BSUID-with-phone-fallback a decided rule in
  `AGENTS.md`.
- **`REQUEST_CONTACT_INFO` button is available on utility and marketing templates globally** (same doc). It
  returns *the sender's own* number when the sender taps it. That is a viable replacement for contact import:
  the owner's friends self-declare into the allow-list. It is not a friend list.
- **WhatsApp authentication OTP** stays as recorded: always charged, up to 24 h approval, not a free utility
  message (`docs/plans/user-management-and-billing-path.md` D3).

## What the intended flow does to the privacy spine

`SPEC.md` "Out of scope for v1" already rejected exactly this: *"Public discovery of strangers by phone
number, and the contact-sync mitigation the competitor doc suggested - both deferred, because public lookup
is a scraping surface we don't need for a gated-circle demo."* Two consequences for anyone reviving it:

1. **Enumeration.** A phone-keyed lookup answers "does this number have a registry", which turns the whole
   E.164 space into a harvestable list (South African mobiles are roughly `10^8` candidates, so a keyed digest is not
   a secret). The accepted answer is the **always-200 invariant**: found and not-found are indistinguishable in status,
   wording and body shape, and a miss creates a proxy registry rather than reporting absence. The residual surface -
   timing, body length, the link returned on a hit, duplicate-create behaviour, and the fact that a bot reply is a
   natural-language side channel - is argued in [rn-d-abuse-model.md](rn-d-abuse-model.md), not assumed away. That
   file also records that the throttle this plan previously assumed was available **is not mounted and has no key
   source** (ledger row 12).
2. **Indexability.** Making registry links "accessible via web search" means dropping `noindex` on a public
   subset. That removes the property the leak suite currently proves on rendered HTML, and it collides with
   `birthday-and-event-countdown`: a friend-written party date is secret from the owner, so it must also be
   absent from any crawlable render. RN-H decides this and recommends that "search on our platform" be a **query, not
   an index**.
3. **Existence by another name.** A proxy registry created in anyone's name means a stranger can mint a page that
   looks like it belongs to a real person and share it into that person's own WhatsApp group. RN-A's answer is that a
   proxy circle never appears as a search result and never claims to represent the recipient; RN-D's threat table
   scores this as the sharpest remaining abuse.

## Development required

Queued as ten tracks with their own handover briefs, order, parallelism and do-not-touch lists:
**[docs/plans/rn-tracks.md](rn-tracks.md)**. Critical path `rn-a -> rn-b -> rn-f -> rn-g`; `rn-d` and `rn-e` are fully
parallel and cheapest to take off the plate early; `rn-h` is recommended defer. The ordered list that used to live
here is superseded by that index - read it instead, because it also carries the two owner decisions (G1: is the
lookup create-only inside the submission window; RN-I: does any of this appear in the 3-minute video) that gate the
implementation tracks.

## Success criteria

- A person can hold one persistent link that survives multiple circles, and `/c/<slug>` still resolves.
- Visibility is one field with a declared projection for every value, and the leak suite passes on the public
  render.
- No route confirms whether a phone or handle exists.
- Nothing sends a message to the owner or the recipient automatically.

## Out of scope

Money holding, native apps, any unofficial WhatsApp client, any crawl of Meta surfaces, and any change to
owner-blindness.

## Open questions

- G1 (RN-D): is the lookup **create-only** inside the submission window, given there is no visibility field yet for
  findability consent? Owner call, and it decides the scope of rn-b.
- Is per-person persistence (`/r/<handle>`) worth the schema change before the hackathon verdict, or is it
  post-submission v1.2?
- Does a public registry show the occasion and date at all, given the secret-date rule?
- Who is allowed to appear in a search index, and can that consent be recorded in a row rather than implied?
