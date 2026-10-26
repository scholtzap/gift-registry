---
title: Deferred feature spikes (deal-finding, coordination agent, SAM duplicates)
type: spec
status: backlog
priority: P3
rank: 40
updated: 2026-10-26
apps: []
related: [SPEC.md, ARCHITECTURE.md]
evidence: docs/strategy/investigations/Meta-Model-API-and-WhatsApp-Cloud-API-findings.md
archived_date: null
supersedes: null
superseded_by: null
---

# Deferred feature spikes

Cut from v1 scope deliberately on 2026-10-26, not accidentally. Each has a kill criterion so a future session can
pick one up without re-deriving the argument. Reorder by rubric value if a day-7 gate comes in early.

## 1. Deal-finding for friends (`web_search` grounding)

**Idea:** when friends pool for an item, the agent searches the open web for a cheaper or equivalent listing and
shows it **only to the people paying**. The gift-target never learns a better price existed.

**Why it was cut:** availability of `web_search` grounding to a South African account is unverified, and it returns
cited prose rather than structured product records, so prices have to be extracted from snippets by the model —
which is where hallucination lives. It was also the handover's Marketplace plan, and Marketplace is prohibited
outright.

**Build shape if revived:** `{"type":"web_search"}` on `/v1/responses`, ~$2.50 per 1,000 search queries; one
extraction call over the cited snippets with a flat `json_schema`; results cached on a new `item_deals` table
carrying `visibility = friend_only` so the projection rule is enforced by the same RLS policy as claims. Fall back
to a self-serve SERP API (SerpApi Shopping Light, `gl=ZA`) when grounding is unavailable. Ship a hand-checked ZA
fixture index as the deterministic demo path.

**Kill criterion:** if extracted prices cannot be verified against the cited source URL in ≥95% of a 20-item test
set, do not show a price at all — show the link and let friends read it.

**Open tension worth deciding before building:** hiding a cheaper option from the owner means the group knowingly
buys a worse deal to preserve a surprise. That may be the right product answer, but it should be chosen rather
than inherited.

## 2. Coordination / nudge agent

**Idea:** the agent proposes splits, assigns the buyer, detects a stalled pool, and drafts the nudge in the
group's tone. Direct entry for the $5,000 Best Agentic Use-Case bonus.

**Why it was cut:** splitting maths is trivial and a judge can say an LLM was wrapped around addition, so the real
work is constraint handling and multi-step state — which is a second product. It also concentrates the highest
ToS-risk surface (outbound sends, marketing reclassification) into the feature that a solo developer would be
building last, when reserves are lowest.

**Build shape if revived:** keep the **solver in code** (budget caps, cannot-buy-for edges, already-purchased,
who-is-buyer) and make the model the **negotiator and explainer**, never the calculator. Toolset must be
friend-scoped. Nudges sent only inside an open 24-hour window, or via an approved utility template tied to an item
the user created.

**Kill criterion:** if the agent's advice cannot be traced to the constraint set that produced it, don't ship it —
wrong coordination advice is worse than no advice, because friends trust it with money.

## 3. SAM 3.1 cross-screenshot duplicate detection

**Idea:** two friends paste two different retailer pages for the same cycling shoe; segmentation plus similarity
catches it before money moves. Repurposing a vision model as a *social coordination* tool is the most
"surprised even us" shape on the rubric.

**Why it was cut:** duplicate matching is not a productised capability — it would be composed from SAM masks,
Spark image understanding and hand-rolled similarity, with unproven accuracy, and the honest cheap version
(same canonical URL or same GTIN text comparison) may well beat it. $2.50 per 1,000 images is affordable but the
50-frame video minimum signals the endpoint is tuned for volume, not two screenshots.

**Build shape if revived:** `POST /v1/responses` with model `sam-3.1`, a noun-phrase prompt plus `input_image`;
returns boxes and pixel masks as a special-token grammar parsed by `@meta-sam/parser`. Cut both products to
background, then compare on embeddings. Use the 10×-cheaper contributor-tier Spark for the batch pass, since
latency does not matter and the 150 RPM cap does.

**Kill criterion:** below ~85% precision and recall on a 20-image fixture set, ship the text/GTIN comparison
instead and describe the feature accurately as URL-matching, not vision.

## Shared notes for all three

- All three must respect the projection rule: any new table declares `owner_visible` or `friend_only` in its
  migration comment, and the leak suite gains an assertion for it.
- All three need a deterministic fallback path before they may appear in the demo script.
- None of them may become day-10 work. If a spike is not finished by the day-7 gate, it stays a document.
