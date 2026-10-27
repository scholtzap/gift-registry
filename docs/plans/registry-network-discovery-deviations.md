---
title: Registry network - discovery, public visibility, and the deviations from the shipped spine
type: spec
status: draft
priority: P3
rank: 900
updated: 2026-10-27
apps: []
related: [SPEC.md, docs/plans/user-management-and-billing-path.md, docs/plans/whatsapp-task-bot-surface.md, docs/plans/birthday-and-event-countdown.md]
evidence: docs/diagrams/pinata-customer-journey.drawio
archived_date: null
supersedes: null
superseded_by: null
---

# Registry network - discovery, public visibility, and the deviations from the shipped spine

**Status:** Draft. Records the intended journey captured 2026-10-27 and every place it departs from what
ships today. Nothing here is scheduled before the 2026-11-04 submission; the submission spine stays as is.

**Diagrams:** [pinata-customer-journey.drawio](../diagrams/pinata-customer-journey.drawio) ·
[pinata-discovery-access.drawio](../diagrams/pinata-discovery-access.drawio) ·
[pinata-registry-network-buildmap.drawio](../diagrams/pinata-registry-network-buildmap.drawio)

## The intended flow, as stated

Search a person by WhatsApp handle or phone → see their registry → the profile owner chooses public or
invite-only → friends sign up via one constant per-person link → the link goes in a WhatsApp status or to
friends → public registries are viewable by anyone, but the viewer must log in with an OTP → registries are
findable both by on-platform web search and by the WhatsApp bot, with a permission request on either path →
import existing Meta/Facebook/Instagram friends to allow-list them.

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
   E.164 space into a harvestable list. The current design deliberately makes every miss a 404 with identical
   copy so the gate "cannot be used to walk a phone list". Any search endpoint needs `checkGateThrottle`
   (`src/server/auth/throttle.ts`, implemented and tested but **still has no production call site**) plus a
   per-IP and per-account cap, and the answer must not confirm existence.
2. **Indexability.** Making registry links "accessible via web search" means dropping `noindex` on a public
   subset. That removes the property the leak suite currently proves on rendered HTML, and it collides with
   `birthday-and-event-countdown`: a friend-written party date is secret from the owner, so it must also be
   absent from any crawlable render.

## Development required, in dependency order

1. `registry_profiles` table (one per user: handle/slug, `visibility`, links to circles) plus a resolution
   route. Expand-only migration; `/c/<slug>` unchanged.
2. Owner-side session and an owner registry screen - closes the open gap already recorded as D4 in the
   user-management plan.
3. Public projection: a friend-safe read of a profile's active circles that renders nothing owner-blind and
   nothing secret, covered by a leak test before any `noindex` is lifted.
4. Request-and-approve flow: pending request rows, surfaced when the owner next opens their own link, never
   pushed.
5. OTP as a second door only after the authentication template is approved; keep the allowlist path as the
   deterministic fallback for the demo.
6. Bot additions as bounded tasks (`find_registry`, `my_registries`) - never free-form.
7. Replace contact import with `REQUEST_CONTACT_INFO` self-declaration, offered by the owner's circle link.

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

- Is per-person persistence worth the schema change before the hackathon verdict, or is it post-submission v1.2?
- Does a public registry show the occasion and date at all, given the secret-date rule?
- Who is allowed to appear in a search index, and can that consent be recorded in a row rather than implied?
