---
title: Handover finish-line outcome (site DNS, app follow-ups, remaining gates)
type: outcome
status: done
priority: P1
rank: 5
updated: 2026-10-28
apps: []
related: [docs/plans/design-system-and-brand.md]
evidence: PR #15 merged; local verification on the merged tree; live HTTPS checks 2026-10-28
archived_date: null
supersedes: null
superseded_by: null
---

# Handover finish-line outcome

Recorded 2026-10-28 from the "HANDOVER — Piñata / Gift Circles: finish line" brief.

## Done

- **App follow-ups 3a–3e** — merged in PR #15:
  - 3a WhatsApp intake photo carries onto the confirmed item only after the person-box
    guard (`guardNoPersonPixels`); fail closed when no detector is configured, the
    capability is off, or a person is in frame — the item still confirms, the photo is
    dropped. Carried photos go through `storePhoto` (re-encoded, no EXIF).
  - 3b Add/replace a photo on an existing item (`setItemPhoto`): owner on their wishes,
    friend on their own ideas only; served only via the projection-checked
    `/items/<id>/photo` route; the replaced file is deleted.
  - 3c Circle-level `defaultCurrency` (expand-only migration
    `20261028120000_circle_default_currency`) threaded into intake drafts and the
    `addItem` fallback; the draft schema accepts any supported currency.
  - 3d Friend hero shows the projection countdown; the rail shows the party date once.
  - 3e Card PNG `wordBreak: 'break-all'` → `'break-word'` (per-font glyph checks untouched).
- **Verification on the merged tree:** typecheck clean, `pnpm leak` 160/160,
  `pnpm test` 518/518, `pnpm build` green, Playwright demo-loop 3/3.
- **Site DNS (task 1):** proxied CNAME `gifts` → `pinata-gifts.pages.dev` and proxied
  CNAME `pinata` → `pinata-gifts.pages.dev` created in the `scholtz.work` zone via the
  Cloudflare MCP (OAuth; the vault `CF_API_TOKEN` proved read-only for DNS — 403 on
  writes — and the reuse decision is recorded in that vault item's notes).
  `https://gifts.scholtz.work/` and `/privacy` return 200.
- **Redirect (added 2026-10-28):** `pinata.scholtz.work` 301 → `https://gifts.scholtz.work`
  with path and query preserved (dynamic redirect rule, verified live).
- **Contact form (task 2):** owner confirmed receipt of the "Deploy check" email.
- **Pre-public check:** `git grep -nE '\+27[0-9]{8,9}'` on main is clean.

## Still owner-gated (not code)

- **Repo visibility:** repo is still private; the hackathon requires public before
  2026-11-04 21:00 ET. Flip when ready (phone check above is clean; re-run before pushing).
- **Demo video (submission step 7):** record from a green demo-loop tree; fictional cast
  only. The three `docs/diagrams/*.drawio` pass the geometry checker; PNG export still
  needs draw.io Desktop or one manual open — no renderer is installed here.
- **RN-F OTP:** externally gated on Meta Business Verification + conversation-tier
  history (see `docs/plans/rn-f-claim-merge.md`). Owner starts the clock; do not build a
  fake OTP door.
- **Task 4:** the app (Oracle VM) is not deployed, so the site CTA stays the contact
  form. When the app goes live, point the site CTA at it and update
  `site/public/index.html`, privacy and `llms.txt`.
- **Housekeeping (task 5):** Stitch duplicate screens, skills-repo PRs and branch
  protection remain the owner's calls.
