---
title: Photo to cutout candidates on SAM 3.1 (intake and card art)
type: spec
status: ready
priority: P2
rank: 6
updated: 2026-10-26
apps: []
related: [SPEC.md, docs/plans/gift-card-f10.md, docs/plans/deferred-feature-spikes.md, docs/plans/entitlements-and-capability-gate.md]
evidence: SPEC.md §Decisions v1.1 (SAM masks composited by us), §User flows F11, docs/strategy/investigations/Meta-Model-API-and-WhatsApp-Cloud-API-findings.md §1.3-1.4
archived_date: null
supersedes: null
superseded_by: null
---

# Photo → cutout candidates (SAM 3.1)

**Status:** Decided into v1.1. Note this is a **different** use of SAM from the deferred duplicate-detection spike in
`deferred-feature-spikes.md` §3, which stays deferred with its own kill criterion.

## Problem

Users have photos, not product pages: a store shelf, a catalogue page, a screenshot, gifts already bought. Today a
photo can only become one item at a time, and the gift card has no product image to put on it.

## Success criteria

- One submitted photo containing two or more gifts yields **at least two** transparent-background cutouts, each
  landing as its own confirmable draft item with the cutout as its image.
- The ingest row records `model_used = sam-3.1` (Stage-1 evidence, not a claim).
- **No cutout contains a person** — face, body, or a hand holding the product — and the ten-image fixture set
  includes a photo with a person in it so the guard is proven to fire.
- The card reuses the same compositing function, so the product on the card is cut out of its own image.
- A webhook redelivery does not re-call SAM and does not create a second candidate set.

## Build shape

1. Gate on `can(actor, 'photo_extract')` **first**; off → fixed menu + "photo extraction is off in your settings".
2. Person pre-check: Spark vision over the source photo with a **flat** `json_schema` returning person boxes. Any mask
   overlapping a person is discarded before it is stored.
3. `POST /v1/responses`, model `sam-3.1`, generic noun-phrase prompt + `input_image`; parse with `@meta-sam/parser`.
4. Rank masks by area, cap at **six**, drop masks below a minimum area. Composite each to a transparent PNG with
   `sharp` at `MEDIA_DIR/cutouts/<wa_message_id>/<index>.png` — deterministic path, so retries reuse bytes.
5. Candidate array into `ingest_events.draft` with per-candidate state (`pending | confirmed | dismissed`) and the
   `item_id` once confirmed. `ingest_events.item_id` stays null for multi-candidate events: one FK cannot point at six
   items, and a seventh table for ephemeral drafts is not worth it.
6. Confirm/dismiss UI per candidate; confirmed drafts create `items` through the **same** transition F2 uses. Nothing
   auto-commits.
7. Projection: a friend's photo drafts are `friend_only` until confirmed, exactly like secret suggestions. The leak
   suite gains a row for it.

## Verified constraints

Muse Image does **not** document transparent-background cutout, so compositing is ours. SAM is $2.50 per 1k images.
Recursive JSON schemas 400 on the Model API — every schema here stays flat.

## Out of scope

Tap-to-select regions (needs an annotation UI we do not have). Duplicate detection via mask similarity. Video frames
(the 50-frame minimum is a different feature).

## Cut line

Kill criterion: below **80% visually clean** cutouts on the ten-image fixture set, ship text-only intake and describe
the feature accurately. Schedule cut order: card-art cutout before photo intake beyond one best mask.
