# Cards worker output

Follow-up completed **2026-10-27**, addressing `security-cards-vision.md` findings **1–3**. Changed only `src/server/cards/validation.ts`, `src/server/cards/render.ts`, `tests/cards/{entries,render,database}.test.ts`, and this existing report. **No `cards/index.ts` changes**; persistence remains parent-owned. No UI, package/lock, env, configuration, CI, schema, RLS, Git, external API, paid calls, downloads, new assets/dependencies, or subagents. Tests used the configured real test database and normal global setup.

## Exported API

`src/server/cards/index.ts` exports:

- `getCard(tx: Tx, actor: Actor, itemId: string): Promise<CardComposerData | null>` — directly uses the composer screen's type: `{ itemId, title, pun, tagline, entries, myEntry }`. Each entry has only `{ displayNameShown, message, anonymous }`.
- `saveCardEntry(tx: Tx, actor: Actor, itemId: string, input: { displayNameShown: string; message: string; anonymous: boolean }): Promise<void>` — upserts only `(itemId, actor.userId)`; rejects extra identity fields. Ineligible/owner requests throw `CardNotFoundError` with `card_not_found`.
- `renderCard(db: Db, actor: Actor, itemId: string): Promise<Uint8Array>` — screen PNG bytes; no filesystem output or cache.
- `renderCardVariant(db, actor, itemId, 'screen' | 'print')` — authenticated print variant.
- `renderCardArtwork(data: CardArtworkData, variant?: 'screen' | 'print')` — deterministic public renderer boundary, returning `{ svg, png, layout, width, height, dpi, bleedMm }`.
- `validateCardEntry`, `CardEntryValidationError`, `CardFontUnavailableError`, `DETERMINISTIC_CARD_PUN`.

Actual circle ownership is looked up before card or ledger queries, so an owner impersonating the friend role stays hidden. Active friend membership plus an unreleased solo claim or a contribution is required. Tombstones do not prevent rendering. Owner entries are excluded. Missing messages still include each eligible gift-giver's first name; saved messages and names are never trimmed or rewritten. Anonymous attribution is always `Anonymous`.

The parent HTTP adapter must map inaccessible cards to the same generic 404, enforce `private, no-store` / `noindex`, omit all OG/Twitter metadata, and never send/preview the image.

## Rendering and constraints

- Real satori → SVG → resvg → PNG, with sharp pinning dimensions and DPI metadata.
- Screen: **840 × 1184**, 96 DPI. Print: **1311 × 1819**, 300 DPI, **3 mm bleed** around A6 (105 × 148 mm trim).
- Separate solo and two-column group layouts; 1–8 gift-givers. Satori measures the natural tree height instead of forcing children into a fixed-height root. Roomy layouts retry compact typography when measured content exceeds the viewport, including dense **three- and four-giver** cards. Any remaining excess is uniformly scaled into the fixed canvas, preserving every text node and explicit blank line. Nonfinite/negative/horizontal bounds fail with `card_layout_overflow`; more than eight entries fail with `card_contributor_limit`. No truncation or message rewriting.
- Message cap: 200 Unicode code points; displayed-name cap: 80. URL detection now applies to **both names and messages**, including anonymous input names, and detects literal IPv4 plus bracketed/unbracketed IPv6 (ports, paths, queries, mapped IPv4 and scoped forms). NFKC/format-character/dot normalisation is detection-only. Identity overrides, invalid XML controls and unpaired surrogates remain rejected. Anonymous may leave the name blank.
- React text nodes escape user words. No raw user HTML/SVG/XML, image references, external hrefs, scripts or foreignObject enter rasterisation. Names/messages never go to a model. No amounts, payment notes, retailer fields or buyer labels are projected/rendered.

## Font and dependencies

The parent-installed `satori`, `@resvg/resvg-js`, and `sharp` are available and exercised. No baseline dependency blocker remains.

Font bytes and resvg's font file still resolve from `next/package.json` → `dist/compiled/@vercel/og/Geist-Regular.ttf`. No network font fetch, copied OS font, hardcoded Windows font path, or system-font fallback. Local inventory also found the installed Syne/Manrope/Space Grotesk packages and transitive HarfBuzz Noto test fonts, but **no bundled emoji/CJK fallback font or emoji image assets**. Build-cache fonts and dependency test fixtures were not promoted into deployable assets.

The actual Geist file has two Unicode **format-4 cmap** records (Unicode platform and Windows Unicode BMP). The renderer now reads this mapping and checks every displayed code point for a nonzero glyph index, including combining marks/selectors inside grapheme clusters. Names/messages remain untouched; an anonymous hidden name does not need rendering coverage. All displayed metadata and fixed copy are checked too. Satori's `loadAdditionalAsset` hook also refuses unsupported graphemes rather than fetching a provider fallback.

Missing/unparseable/unsupported-format local fonts throw `CardFontUnavailableError`. Missing displayed glyphs throw **`CardUnsupportedGlyphError` / `card_unsupported_glyph` before rasterisation**, not a successful PNG with vanished words. The new error is exported directly from `src/server/cards/render.ts`; `cards/index.ts` was not edited to re-export it. Emoji, CJK and unsupported combining/variation sequences therefore remain saveable verbatim but **cannot export** with current assets. Supported precomposed/decomposed accented text is exercised as literal SVG text and visibly distinct PNG bytes. This is coverage for the actual bundled font, not a claim of universal script/shaping support.

## Actual test evidence — 2026-10-27

Every run used the repository `vitest.config.ts`, including **real Postgres global setup, Prisma migrations and policy application**. No `config:false`, `globalSetup:[]`, or `LEAK_SKIP_POLICIES` shortcut was used. The earlier worker's isolated-run evidence is superseded by this run.

```bash
ELECTRON_RUN_AS_NODE=1 "C:/Users/apsch/AppData/Local/Programs/Qoder/Qoder.exe" "C:/Users/apsch/Documents/personal/gifts-registry/node_modules/vitest/vitest.mjs" run tests/cards
ELECTRON_RUN_AS_NODE=1 "C:/Users/apsch/AppData/Local/Programs/Qoder/Qoder.exe" "C:/Users/apsch/Documents/personal/gifts-registry/node_modules/typescript/bin/tsc" --noEmit --incremental false
```

- Baseline: **29 passed** across entries/render boundaries with normal setup.
- Regressions before fixes: **27 failed / 48 passed**. Names/IP links were accepted; maximum-width **3- and 4-giver** exports failed on both variants; multiline exports overflowed; missing emoji/CJK exports resolved instead of refusing.
- Validation-only verification: **41 passed**, proving both fields reject URLs/IP forms while inputs remain unchanged, including detection-normalised obfuscations and ordinary non-link punctuation.
- Glyph-only verification: **9 passed**, exercising emoji, CJK, unsupported combining/variation sequences, every displayed metadata field, supported accented PNG differences, and hidden anonymous-name coverage.
- Final full cards run: **100 passed in 3 files** — `entries.test.ts` **41**, `render.test.ts` **51**, `database.test.ts` **8**.
- Layout regression matrices cover **all counts 1–8 × screen/print**, both **80 W name + 200 W message** and **80-code-point multiline name + 200-code-point multiline message**. Tests count every contributor letter and the footer and inspect SVG text/rectangle geometry after the actual viewport transform; real PNGs retain their prescribed dimensions. Existing DPI, literal markup, anonymity, determinism and receipt-omission assertions remain green.
- Real DB tests prove unsupported Unicode messages survive **save → get → failed export → get** verbatim, and URL-bearing names/IP messages cannot overwrite a saved entry. The existing six privacy/access/create/update tests also passed, including the own-entry update previously blocked in the older worker report. **No RLS or persistence changes were made here.** Fixtures are the existing fictional cast and clean only their own rows.
- TypeScript: **passed**, `--noEmit --incremental false`; no tsbuildinfo written.
- The DB fixture run emitted an existing `pg` concurrent-query deprecation warning. It did not fail tests; shared DB code was not changed.

## Unclosed limitations / parent-owned work

1. **Full emoji/CJK font coverage is unavailable locally.** Exports now fail explicitly and retain saved words. Additional licensed deployable fonts/emoji assets need parent approval; no download/install was attempted. This parser deliberately supports the verified Geist format-4 cmap only; a different font format requires explicit support, not guessed coverage. Next's internal font deployment inclusion/portability remains unverified by these local tests.
2. **Extreme newline density reduces type size.** Uniform fitting preserves all lines and stays inside the canvas, but is not a guarantee of comfortable reading at fixed screen/A6 dimensions. A larger/paginated export contract would be a separate parent-owned decision; no output API or UI was expanded here.
3. **HTTP reveal/privacy handling remains parent-owned.** These DB/renderer boundaries do not prove HTTP authentication, indistinguishable 404s, no-store/noindex, OG omission or human-only delivery.
4. **No live Spark pun proposals, buyer-choice persistence, muse-image art, or vision cutout integration.** Existing saved pun text is read; otherwise the explicit deterministic line is returned with `Plain card wording — no AI call.` No model endpoint/provider invention or paid operation. Any later model-spending path must use the real shared model client and pass `can(actor, capability)` first; the current renderer has zero model calls. Security review finding 4 (vision publication races) was outside this task.

Changes remain uncommitted for the parent to integrate; Git operations were explicitly excluded.
