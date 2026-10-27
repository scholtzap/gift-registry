---
title: Piñata parallel build and verification closeout
type: plan
status: implementing
priority: P1
rank: 2
updated: 2026-10-27
apps: []
related: [gift-circles-ten-day-build-plan.md, design-system-and-brand.md, gift-card-f10.md, vision-cutout-intake.md, whatsapp-task-bot-surface.md]
evidence: ../operations/parallel-agent-outputs/
archived_date: null
supersedes: null
superseded_by: null
---

# Piñata parallel build and verification closeout

The user requested parallel implementation, one worker per seven screens plus landing, defensive reviews, release hygiene and local deploy artifacts. Public test boundaries (browser, HTTP/webhook, public domain functions; real test Postgres, external-service fakes only) and MIT are approved.

## Finish line

- Real authenticated owner and friend flows use the V7 screens, not detached previews.
- Claims, contributions and human draft confirmation use scoped atomic ledger functions.
- WhatsApp intake verifies raw signatures and preserves dedupe and immediate media acquisition. Live model/API support is not claimed from fixtures.
- Card route, PNG, cache headers and preview surfaces refuse the recipient without revealing existence.
- Person-mask intersection is rejected before persistence; unsupported live SAM is reported, never silently simulated.
- Browser golden path and relevant negative cases, real-database privacy tests, typecheck and build are run and their actual outcomes recorded.
- Each worker has a report below. Unverified/live-blocked features remain open.

## Worker ownership and evidence

| Worker | Owned surface | Report | Status |
| --- | --- | --- | --- |
| Brand | shared components, CSS, layout | [brand](../operations/parallel-agent-outputs/brand.md) | Returned; V7 light-only styling, local fonts and app icon integrated |
| Join | gated join screen | [join](../operations/parallel-agent-outputs/join.md) | Returned; autocomplete repaired, native gate tested |
| Owner | owner ledger screen | [owner](../operations/parallel-agent-outputs/owner-ledger.md) | Returned; mounted, role privacy and mobile layout tested |
| Friend | friend ledger screen | [friend](../operations/parallel-agent-outputs/friend-ledger.md) | Returned; mounted and native navigation tested |
| Item | friend item actions | [item](../operations/parallel-agent-outputs/item-detail.md) | Returned; claim/release/pool/contribute/paid POSTs mounted and tested |
| Draft | editable human confirmation | [draft](../operations/parallel-agent-outputs/draft-confirm.md) | Returned; manual and actor-private versioned intake confirmation mounted and tested |
| Card UI | own entry and manual download | [card UI](../operations/parallel-agent-outputs/card-composer.md) | Returned; preview/save/PNG and no-JavaScript anonymous save tested |
| Settings | actor's capability switches | [settings](../operations/parallel-agent-outputs/settings.md) | Returned; native GET/POST and reload persistence tested |
| Landing | static public page | [landing](../operations/parallel-agent-outputs/landing.md) | Returned; real invite-entry destination mounted and tested |
| Ledger | guarded transactional writes | [ledger](../operations/parallel-agent-outputs/ledger.md) | Returned; advisory-lock repair returned; 26 real-DB cases pass |
| Intake | webhook, media, models, worker, fixed tasks | [intake](../operations/parallel-agent-outputs/intake.md) | Returned; mounted webhook and real queue lifecycle tested; live transport/inference unverified |
| Vision | person-safe candidate pipeline | [vision](../operations/parallel-agent-outputs/vision.md) | Returned; atomic-publication repair returned; 56 cases pass |
| Cards | eligible contributor entries and PNG | [cards](../operations/parallel-agent-outputs/cards.md) | Returned; URL/layout/glyph repair returned; 100 cases pass |
| Release | ignores, MIT, README, redacted scanning | [release](../operations/parallel-agent-outputs/release-hygiene.md) | Returned; assembled 214-file candidate and 26 reachable commits scanned |
| Ops | throttle, owner credential, local deploy artifacts | [ops](../operations/parallel-agent-outputs/ops.md) | Returned; production deploy/Windows credential issuance unverified; throttle helper unmounted |
| Accessibility | screen audit and human task script | [accessibility](../operations/parallel-agent-outputs/accessibility-and-click-tests.md) | Returned; ten development and production browser flows pass; human/AT audit remains open |
| Security | complete cards/vision modules | [security](../operations/parallel-agent-outputs/security-cards-vision.md) | Returned; four findings repaired and integration evidence appended |

All 17 original worker/review outputs are recorded above. Three repair workers updated the existing ledger, cards and vision reports; their source changes were verified by the coordinator. An additional read-only intake security review is recorded in the parent addendum to the intake report. No worker remains running.

The coordinator owns package/lock, environment contract, route adapters, integration tests and the final integrated evidence. Original worker reports retain their historical scope; dated parent addenda record later integration. Shared files were not concurrently delegated. Screen completion is not completion of every action shown on a screen.

## Verified local results — 2026-10-27

- **393/393 Vitest cases in 34 files** pass with the normal real PostgreSQL global setup, migrations and policies. Included: 100 cards, 56 vision, 26 ledger, 18 owner-blindness, 14 capability-gate and 10 WhatsApp integration cases. External inference/media responses are explicit test services, not live-provider evidence.
- **Typecheck and production build pass.** The final chain was `pnpm test && pnpm typecheck && NEXT_DIST_DIR=.next-verification pnpm build && PLAYWRIGHT_PRODUCTION=1 pnpm test:browser` under Git Bash. No failing test was skipped to obtain these results.
- **10/10 actual Chromium production flows pass**, after the security repairs. The same ten development flows passed earlier: landing/invite entry; webhook challenge/signature refusal; generic gate/private 404; owner privacy and mobile navigation; friend manual draft with unknown price; claim/release/pool/contribute/paid persistence; private settings POST/reload; card preview/anonymous save/literal message/PNG; anonymous save without JavaScript; owner and forged-friend card exclusion/no OG. Owner widths 320/390/1024 were checked; the 390-pixel screenshot was visually inspected.
- Two additional **High intake findings** were reproduced with four failing-before real-DB regressions. Session locks now use a separate two-connection pool instead of consuming the ten actor-query connections; both pools have bounded acquisition and close on disconnect. Explicit user capability choices survive inherited grant expiry, and toggles clear expiry. All **24 focused capability/intake cases** then passed, followed by the full final chain. These reds did not remove RLS policies.
- Native private routes preserve stable GET/POST `/c/<slug>`, canonical-origin mutation checks, generic inaccessible-resource 404s, no-store responses and no card previews. Actor-private version-1 drafts require human confirmation of corrected values and create exactly one item.
- Raw HTML Node SSR uses the existing React server renderer through `createRequire`; hook-free screens have caller-owned unique field IDs. Fonts, sharp and resvg work locally with installed dependencies. Native route traces include the font/image packages but not the dynamic React renderer require, so minimal standalone and Oracle ARM64 packaging are not certified.
- Vision rejects intersecting person boxes before storing any SAM batch, zeroes excluded RGB/alpha, and fully writes/closes private temporary PNGs before hard-link publication without replacement. Real-file concurrency/failure retries pass. This is local Windows NTFS evidence, not fsync, crash-durability, hostile-directory-swap or live person-detection evidence.
- Contributor words remain verbatim. Unsupported displayed glyphs refuse card export rather than disappear; emoji/CJK coverage was not added. Supported layouts retain all text across one to eight givers; extreme newline density can reduce readability. Cards are generated for manual delivery only.
- Gitleaks 8.30.1 scanned **214 tracked plus nonignored untracked candidate files** and **26 local reachable commits**, with zero findings, omissions or tracked-ignored files. Separate location-only phone checks returned zero matches. The release report records the scope and final refresh; historical private-account URL identifiers still require a publication decision.

## Verification and review queue

- [x] Discover and run JSX screen tests; repair autocomplete, native no-JavaScript save and unique field IDs.
- [x] Mount all seven V7 screens plus landing and real invite entry without moving the circle URL or relaxing owner/friend branches.
- [x] Mount item, versioned draft, settings and private card adapters; enforce canonical origin on mutations.
- [x] Mount signed webhook and real queue worker with explicit demo mode; document that HTTP acknowledgement is not an outgoing WhatsApp message.
- [x] Run the real Postgres suite, typecheck, production build and actual development/production browser golden and negative paths.
- [x] Complete bounded cards/vision and intake defensive reviews; reproduce and repair verified findings.
- [x] Prepare first-click tasks and a static accessibility audit; no simulated participants or usability/conformance claims.
- [x] Review direct dependency metadata/API/license constraints without a blind upgrade or advisory-clearance claim.
- [x] Scan assembled working content/history and separate phone patterns with redacted local outputs; no secret upload.
- [x] Update the existing [architecture map](../../ARCHITECTURE.md), [README](../../README.md), worker reports and this indexed closeout from actual modules/results.
- [ ] Apply only user-approved Humanizer suggestions; contributor names/messages and security/privacy facts are outside cosmetic rewriting.
- [ ] Run a bounded local k6 smoke when the tool is available. k6 is unavailable; no load test was run.
- [ ] Perform human assistive-technology/usability validation and remaining accessibility recovery/zoom checks. Browser automation does not establish WCAG conformance.

## Remaining implementation and external work

1. **Real Meta/WhatsApp demonstration:** configure the authorized app/WABA/phone/authentication template and credentials, verify BSUID/physical-device intake and a consent-gated model request, and implement/test outgoing task-specific replies. The current mounted webhook, queue, stored drafts and explicit-demo fixtures do not prove these external steps. Audio conversion tests fake only the process runner; an installed real FFmpeg conversion remains unverified.
2. **Production access:** mount and exercise M-02 gate throttling; settle and positively test D4 owner credential issuance on Windows and possession-based friend access. Current allowlist matching and fixture cookies are not OTP proof.
3. **Remaining ledger product actions:** circle creation, owner tombstone/pivot and multi-user purchase remain fail-closed/incomplete. Existing claim/contribution/payment-marker tests do not establish these actions.
4. **Vision integration:** verify the live person/SAM protocol and bind actor-authorized ingest sources to screenshot/multicandidate intake. The default adapter refuses with `live_protocol_unverified`; no live SAM support is claimed.
5. **Oracle delivery:** obtain VM/Cloudflare details; validate full-dependency Linux ARM64 images, private ports/media, TLS, app/worker lifecycle, migrations, backups and restore. Local artifacts are not a deployed service or tested rollback.
6. **Publication review:** resolve historical private-account URL identifiers and complete exact-candidate asset/font/license and reachable-advisory review before an explicitly approved public flip. No history rewrite is authorized.

## External blockers and authorization limits

No public flip, deployment, live messages, paid API calls, CI changes, commits, pushes or secret publication are authorized by this implementation request. No provider credentials were retrieved for live use. Changes remain unstaged and uncommitted for review. Local artifacts and synthetic fixtures are reversible and are not evidence of a live deployment.
