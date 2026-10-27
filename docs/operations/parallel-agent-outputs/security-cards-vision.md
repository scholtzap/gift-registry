# Piñata cards / vision defensive review

## Summary

Four verified Medium issues; no verified Critical/High issue. This is not HTTP/RLS integration approval.

## Medium findings

1. **URL rejection bypass.** `C:/Users/apsch/Documents/personal/gifts-registry/src/server/cards/validation.ts:15-17,35-38` checks URLs only in messages; names accept `https://example.test/deal`, and messages accept `192.0.2.1/deal`. Save/load/render flow: `C:/Users/apsch/Documents/personal/gifts-registry/src/server/cards/index.ts:98-107`; `C:/Users/apsch/Documents/personal/gifts-registry/src/server/cards/render.ts:80-81`. **Impact:** retailer/link smuggling into human-revealed cards, not SSRF/XSS. **Recommendation:** reject URL-bearing names and literal-IP URLs. **Verified:** validation, mock-Tx persistence, actual raster rendering.

2. **Unicode words disappear.** `C:/Users/apsch/Documents/personal/gifts-registry/src/server/cards/render.ts:38-44,99-108` uses only Next's internal Geist font without system fallback. Emoji/CJK glyph indices are zero; different emoji/CJK messages produce identical PNGs. **Impact:** literal-message fidelity fails. **Recommendation:** package licensed local fallback fonts/emoji assets; verify glyph coverage and deployment inclusion. **Verified:** font parsing and raster comparisons; packaged deployment untested. This dependency choice has a demonstrated correctness cost.

3. **Permitted four-giver card overflows.** `C:/Users/apsch/Documents/personal/gifts-registry/src/server/cards/render.ts:70-81,101-105`: four entries containing 80 name/200 message `W` characters throw `card_layout_overflow`; eight succeed. **Impact:** valid saved cards cannot export. **Recommendation:** fit/paginate all supported counts without truncation. **Verified:** actual rendering; existing maximum-width test covers eight only.

4. **Incomplete final files poison retries.** `C:/Users/apsch/Documents/personal/gifts-registry/src/server/vision/index.ts:151-161` creates the final filename before writing. **Impact:** concurrent identical retries conflict; failed writes leave permanent conflicts. **Recommendation:** atomically publish completed files; clean failed temporary writes. **Verified:** deterministic virtual-filesystem interleavings; real-disk scheduling untested.

## Coverage / gaps

Read all four modules, five cards/vision tests, matching composer test, and supporting fixtures/gates. Loaded secure-code-review, Next/React guides, llm-security, and checklist. Bounded in-memory probes confirmed owner/non-giver exclusion, inert rendering, deterministic PNGs, person/mask guards, zeroed excluded pixels, and consent/demo gates. No ledger amount fields or remote rendering I/O found.

**Unverified:** HTTP authentication/404/cache/OG/delivery; own-entry UPDATE policy; real Postgres; live person-detection accuracy/timeouts; source ownership binding; filesystem replacement races; deployment font portability. Nine-giver projection exceeds the documented eight-giver renderer cap. Consent checks precede each spend but are not atomic with dispatch. Existing tests were read, not run: global setup mutates Postgres. Only this report was written; no other persistent changes.

## Parent repair and integration evidence — 2026-10-27

All three repair workers returned; their output was checked against source changes and tests. URL validation now covers names and messages, including literal-IP URLs. Unsupported glyphs refuse explicitly rather than disappearing; this does not add emoji/CJK rendering support. Card layout regressions exercise maximum-width and multiline entries at supported counts on screen/print without truncation. Vision publication now fully writes and closes a private temporary file before hard-link publication without replacement, with real-file retry/concurrency tests. No fsync or crash-durability claim is made.

Final assembled results: **100 card tests** (51 renderer, 41 entries, 8 real PostgreSQL) and **56 vision tests** (44 extractor, 10 publication, 2 compositor), included in **393/393 Vitest cases**. Real card persistence/RLS verifies contributor-only updates; native Chromium flows save/preview/download literal entries, allow anonymous save without JavaScript, and deny owners/forged-friend cookies with generic no-store 404/no preview. Typecheck and production build passed, followed by **10/10 production Chromium flows**.

Private card font/native dependencies work locally with installed node_modules; circle trace files contain Geist, sharp and resvg. The dynamic React renderer require is not listed in traces, so minimal standalone packaging is not certified. Oracle ARM64, live person/SAM accuracy, screenshot-to-cutout integration, crash/power-loss and hostile-local-filesystem races remain unverified. The eight-giver renderer limit remains; no broader scalability claim follows from these tests. Contributors' words were not rewritten.
