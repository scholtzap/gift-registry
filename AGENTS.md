# AGENTS.md — gift-registry (Gift Circles)

WhatsApp-native group gift registry, built for the Meta Global AI Developer Hackathon
(Indie Developer track). Submission deadline **2026-11-04 21:00 ET**; repo must be **public**.

## What this product is

One owner creates a "circle", pastes one gated link into their WhatsApp friend group. Friends
claim or pool money behind a single assigned buyer. **The owner never sees what is claimed,
pooled, or suggested** — owner view and friend view are two projections of one ledger. Meta
models do multimodal intake (voice note / product screenshot / pasted URL → structured item),
vision segmentation, deal discovery on the open web, and group coordination.

## Non-negotiable product rules

- Owner view ≠ friend view. Any new field must declare which projection renders it.
- Friend-added items are owner-hidden until optionally revealed after the event.
- Owner "delete" is a soft delete: tombstone for the owner, ledger + money state survive for friends.
- No money is held. Payments settle manually in v1; the schema must not need rewriting for Stripe Connect later.
- Deal suggestions reach **friends only**. The owner must not learn a cheaper option exists — that spoils the gift.
- **The reveal is a human act.** The system generates the gift card (contributor names + their own messages) and
  never delivers it: no send, no notification, no `og:` preview, no cacheable response on any card route. The circle
  link lives in a WhatsApp group that contains the owner, so a preview image is rendered *for the owner*.
- **No model call without passing `can(actor, capability)` first.** One gate, every spending path. A capability that
  runs after the user switched it off is a consent failure and ranks with a privacy leak, not with a bug.
- **No person pixels in a cutout.** The person-box pre-check runs before a SAM mask is stored, and the fixture set
  includes a photo with a person in it so the guard is proven to fire.
- **The assistant never decides what happens next.** It may generate copy for a status answer or a card message; it
  may not choose a task, change state, or answer anything outside the six bounded tasks. Fixed menu or nothing.
- **`/c/<slug>` never moves.** That URL is pasted into a WhatsApp group; a test asserts it resolves.

## Verified platform constraints (do not re-litigate; re-verify before changing)

- **Marketplace scraping is prohibited.** Meta's Automated Data Collection terms bar programmatic
  collection without written permission, and no Marketplace search API exists for third parties
  (the Content Library API is research-institution-only). Deal-finding uses Meta Model API
  `web_search` grounding instead. Never describe the feature as "searches Marketplace".
- **WhatsApp OTP must be an *authentication* template** — always charged, ≤24h approval. It is not a free utility message.
- **Webhook media IDs expire in 7 days**, not 30. Parse and store bytes on ingest.
- **Key users on Business-Scoped User IDs**, with phone number as fallback. Phone is omitted from webhooks for users with usernames.
- **Muse Spark 1.3 audio understanding is degraded** — use 1.2 for voice-note intake.
- **WhatsApp `.ogg/opus` must be converted** to RIFF/WAVE mono 16-bit PCM 16 kHz before Muse Voice Transcribe.
- **General-purpose AI chatbots are banned on the WhatsApp Business Platform** by the Business Solution Terms from
  **2026-01-15**, immediately for accounts registered on/after **2025-10-15** — ours will be new. Task-specific
  assistants (customer service, orders, appointments) remain permitted, so the assistant is task-scoped by design.
  The hackathon separately disqualifies platform-policy violations, so free-form chat is a submission risk, not a
  style choice. Verified 2026-10-26 against the Business Solution Terms and secondary coverage.
- **Interactive messages cannot be notifications** and only work inside the 24-hour customer-service window; outside
  it you need an approved template. Reply buttons max 3, list messages ≤10 sections / 24 rows.

## Dependency rules (decided, with the reasoning in `docs/plans/user-management-and-billing-path.md`)

- **Never adopt an unofficial WhatsApp client** — `whatsapp-web.js`, Baileys, `wa-automate-nodejs`, wppconnect,
  Evolution API. They drive WhatsApp Web or reverse-engineer the multi-device protocol, which violates the Business
  Solution Terms; the hackathon disqualifies platform-policy violations. **Star count is not evidence of permission** —
  wwebjs's own README says WhatsApp does not allow bots or unofficial clients. Use
  `Secreto31126/whatsapp-api-js` (MIT), which covers the two places a subtle bug is a security hole: webhook signature
  verification and media download by media-id.
- **Never adopt a flag or entitlement service** — Unleash (AGPL-3.0), Flipt (fair-core), PostHog (mixed licence),
  Flagsmith (heavy). Per-user capability state is private data under RLS; a flag service evaluates outside RLS, which
  means shipping entitlement state to a sidecar. `entitlements` + `can()` already is the off switch, with no redeploy.
- **No auth framework.** The credential is "Meta verified this BSUID" or "this person proved possession of an
  allow-listed number", which Better Auth / Auth.js / Supabase / Clerk do not model, and each of them either ignores
  WhatsApp delivery or owns identity tables outside the RLS boundary. Sessions are a signed cookie
  (`src/server/auth/session.ts`), `SameSite=Lax` because `Strict` breaks the click out of WhatsApp's in-app browser.
- **No payment integration before submission.** Stripe does not onboard South African entities. The post-hackathon ZA
  rail is **PayFast** (ZAR into a ZA bank, no monthly fee, first-party Subscriptions API); two constraints shape the
  design — **recurring is credit-card only**, and **PayFast is a gateway, not a merchant of record**, so EU/UK/US
  digital-services tax stays ours until a MoR (Paddle first choice) is adopted on the first non-ZA subscriber.
  `users.plan` and `entitlements.source = 'subscription'` are the seam — nothing else is needed now.
- **Card rendering is satori + resvg, not Puppeteer.** MPL-2.0 is file-level copyleft, so unmodified npm packages in a
  public repo carry no obligation, and no Chromium binary goes on the Oracle VM.

## Documentation KB skills

Skills path: `~/.claude/skills/`

| Task | Skill |
|------|-------|
| First-time KB setup | /doc-kb-setup |
| Save docs to Notion/Outline | /doc-kb-save (only when asked; CI owns sync) |
| Load context from KB | /doc-kb-load (auto when topic needed) |
| Audit cross-source drift | /doc-kb-consolidate |
| Fill a documented gap | /doc-kb-build |
| Enforce local docs health (archive, merge, links) | /doc-kb-enforcer |

Config: `DOC_SYNC_TARGET=notion` in `.env`

## Documentation KB sync (auto-managed)

### doc-kb-load (on demand)
When context is needed for a specific topic, run `/doc-kb-load <topic>` **before answering**.
- Do NOT load all docs at session start
- Search Notion MCP or Outline API by topic keyword — fetch only relevant pages
- Fall back to local `docs/` grep if KBs are unreachable
- Source priority: per DOC_SYNC_TARGET — both → try Notion first (richer search); outline only → Outline API; notion only → Notion MCP

### repo-memory (free-game)
Save to `.memory/main.sqlite` (project-memory MCP) at any time without asking. Read at session start.

## Agent knowledge (mistakes / wishlist / architecture)

- **Mistakes:** git-root `MISTAKES.md` — append when a mistake is known, newest first.
- **Wishlist:** git-root `WISHLIST.md` — tooling **and** discovery-tax / quickref inefficiencies. Not a human task list. Cross-repo items go to the umbrella wishlist, not here.
- **Architecture:** git-root `ARCHITECTURE.md` — read §§1–3 before exploring. Update with skill `repo-architecture` when structure changes. Complements graphify; do not paste the graph here.
- **Install:** `~/.claude/skills/doc-kb-setup/bundle/agent-knowledge/install_agent_knowledge.py --target . --append-agents --seed-memory`

## Plans system

`docs/plans/` is the work queue. Every plan, TODO, deferred item and handover goes there as its
own file with YAML frontmatter (`type`, `status`, `priority`, `rank`), then
`python scripts/ops/refresh_plans_index.py --write` — **and read the diff to confirm your row
landed in `PLANS_INDEX.md`**. Never leave a plan in a chat message or a TODO comment.

## Build discipline for this repo

- Judgeable surface beats breadth. The rubric is Impact 30 / Use of Meta AI tooling 25 /
  Technical depth 20 / Demo 25, so a shallow-but-real Meta integration scores worse than one
  deeply-used model.
- The demo is a 3-minute video. Any feature that cannot be shown live (or from a committed
  fixture) is not a feature, it is a plan.
- Keep a deterministic fallback path for every live API call — network or key failure during
  recording must not kill the demo.
- Do not commit scraped JSON dumps or any data you lack rights to; the rules disqualify on that.
- **This repo is public.** Never commit a real phone number, real name, or real gift conversation. Demo data is
  the fictional seeded cast only. Allow-listed numbers are hashed in the database. Check
  `git grep -nE '\+27[0-9]{8,9}'` before making the repo public, and again before every submission push.
- Never auto-roll back a Prisma migration in production. Recovery is previous image tag plus `pg_restore` of the
  nightly dump; migrations are written expand-only so the previous image still runs.
