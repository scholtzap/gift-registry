# Vision boundary output — 2026-10-27

**Partial delivery, not live SAM support.** The injected public pipeline and shared compositor are implemented and tested. The default adapter refuses with `VisionError.code = 'live_protocol_unverified'`. No paid inference, live-model credential access, third-party images, package/config changes, or git mutations were performed by this worker.

## Owned files

- `src/server/vision/index.ts`
- `tests/vision/extractor.test.ts`
- `tests/vision/composite.test.ts`
- `tests/vision/publication.test.ts` (finding 4 follow-up)
- `tests/fixtures/vision/synthetic.ts` (original delivery; unchanged in the follow-up)
- This output file.

## Public contracts

```ts
createCutoutExtractor({
  mediaDir: string,       // absolute, existing, trusted media root
  sourceId: string,       // trusted ingest/message identity; hashed, never a path
  services?: VisionServices,
  DEMO_MODE?: boolean,    // only literal true allows services.mode === 'demo'
}): (db: Db, actor: Actor, imagePath: string) => Promise<CutoutResult>

renderMaskedCutout(
  image: Buffer,
  mask: RasterMask,
  personBoxes: PixelBox[],
): Promise<Buffer> // cropped transparent PNG, not a filesystem write
```

`VisionServices` is the external boundary only:

- `mode: 'live' | 'demo'` is a caller declaration, not evidence that inference ran.
- `detectPeople(image: VisionImage): Promise<unknown>` must return `{ width, height, boxes }`.
- `segment(image: VisionImage): Promise<unknown>` must return an array of `{ width, height, box, pixels: Uint8Array }`.
- Both receive independent copies of the same normalized PNG with immutable dimension fields. No source path, actor, entitlement state or DB handle is passed to them.
- Every box is `{ x, y, width, height }` in **normalized source pixels**, half-open rectangles. Mask boxes must use integers; fractional person boxes are rounded outward. Raster pixels are full-image row-major binary 0/1, not cropped masks, alpha 0/255, normalized coordinates or token text. Providers must normalize their verified protocol before returning.

`CutoutResult` contains `visibility`, `executionMode`, `rejectedPersonMasks` and `candidates`. Each candidate has `state: 'pending'`, a fixed neutral title, occupied-pixel `area`, and relative `imagePath`. Friends receive `friend_only`; owners receive `owner_visible`. There is no model-guessed price/title, item creation, ledger transition, `modelUsed` assertion or ingestion-row write.

No three-argument live `extractCutouts` singleton is exported: that would imply a supported live integration which this worker has not established. The factory supplies the tested three-argument function once the parent provides the external services.

## Enforced behavior

- Uses the existing `assertCan` evaluation inside real `db.withActor` transactions. Checks before input work, again immediately before person detection and SAM, and after SAM before processing/storage. Revocation during either external stage prevents the next stage/storage. No transaction is held across an external call.
- Person detection is validated **before SAM**. Malformed, absent or mismatched person data fails closed. The entire SAM batch is validated before any cutout write.
- Rejects every mask whose enclosing box intersects any detected person box, even if the overlap covers no occupied pixel. Every occupied raster pixel must lie inside its declared box, preventing a false safe bbox from hiding person pixels.
- The public compositor repeats validation and person-overlap rejection, so a card caller cannot bypass the intake guard. Pixels outside the mask have RGB **and** alpha set to zero. There are no V7/design-token/card-delivery dependencies.
- Only single-frame JPEG/PNG input; maximum input/normalized bytes 5,000,000, dimension 8192, decoded pixels 16,000,000. Normalizes orientation and sRGB before either service or compositing. Vectors, invalid/truncated input and oversized decodes are refused.
- Maximum 32 person boxes, 32 masks, 64,000,000 aggregate raster bytes. Minimum occupied area is `max(4, ceil(imagePixels * 0.001))`; largest six survive.
- Absolute bounded media paths only; rejects lexical traversal, outside siblings, Windows ADS-style components, symlinks/junctions and source hard links. Real filesystem junction tests pass on Windows.
- Output is `cutouts/<sha256(actor, circle, sourceId, normalizedImageDigest)>/<index>.png`; no provider-selected filename. An exclusive same-directory `.<index>.png.<UUID>.tmp` file (0600 file/0700 directory intent) is fully written and closed before a hard link publishes the final name without replacement. A `finally` unlinks the private temporary file on success, conflict, and write/close/publication exceptions. Paths are rechecked before publication. Identical final bytes are reused; differing bytes raise `cutout_conflict`, never overwritten. Changed source pixels use another namespace.
- An existing final may briefly have two hard links while the winning publisher cleans up. Retry comparison accepts that only when a same-directory, regular, correctly named private temporary file has the same device/inode and two links (or cleanup has already reduced the count to one). Source hard links and unrelated final hard links remain refused.
- External failures produce fixed error codes without upstream messages/causes, with no fixture fallback. No production fixture provider is shipped; opting into a demo provider requires explicit `DEMO_MODE: true`.

Media roots must be application-controlled, not writable by untrusted local processes. Filesystem checks are traversal defenses, not an openat-style guarantee against a privileged concurrent directory-swap attacker. Publication was tested on local Windows NTFS only: it requires same-filesystem hard-link/no-replacement semantics, fails closed on a link error, and does not fall back to overwriting `rename`. This is not evidence of safety on unsupported/network/cloud-sync filesystems or of crash/power-loss durability; cleanup errors are surfaced, not silently ignored. The parent must resolve an actor-authorized ingest source before calling this function: an entitlement check does not establish ownership of every file under a shared media root. Do not expose returned relative paths through an owner-visible/static media route without the correct projection authorization.

## Finding 4 remediation evidence — 2026-10-27

Reviewed `security-cards-vision.md` finding 4. This follow-up changed only `src/server/vision/index.ts`, added `tests/vision/publication.test.ts`, and updated this existing document. No source outside that boundary, DB, route, config, dependency, Git, or live-provider changes were made. Person exclusion and spending/consent gates are unchanged.

The public extractor regressions use real temporary directories under Windows `%TEMP%`, actual PNG decoding/compositing, real writes/close/hard links/stat/read/unlink, and promise barriers (no sleeps). Test-only filesystem wrappers delegate to those operations and inject scheduling or errors; they are not a virtual filesystem. The real `assertCan` runs against an in-memory transaction stub, and the external services return explicit demo masks.

- **Concurrency:** same/different bytes while the first writer has physically written only eight bytes; the completed second writer wins, identical first output succeeds, and differing first output conflicts. The final name is absent during the partial write. Also pauses a winner after real `link` but before temporary unlink: identical retries succeed, differing retries conflict, the published PNG is complete, and the final inode is not replaced. Every completed case leaves just `0.png` with one link.
- **Failure/retry:** errors before any bytes, after an actual partial write, after a real close, and before publication. Handles are closed, no final or temporary file remains, and the same public extractor retry stores the expected complete PNG. These are deterministic injected failures, not disk-full/power-loss experiments.
- **Bounds:** source hard links and an unrelated pre-existing final hard link remain refused, with the latter's external bytes unchanged. Existing real junction/traversal, person-pixel, demo, and consent-revocation tests also pass.
- **Red proof:** the original final-path `O_EXCL` writer produced two concurrency conflicts and three poisoned-final cleanup failures. A subsequent transient Vite transform reinstating that exact writer in memory (no disk/source/Git rollback) made eight finalized regression cases fail in 195 ms: those five, two missing-link publication assertions, and the publication-failure assertion. No timeouts were counted as behavioral evidence.
- **Final green:** two consecutive offline programmatic Vitest runs each passed **56/56** tests in three files: 44 existing extractor, 2 existing compositor, and 10 publication tests. Runner options were `config: false`, `globalSetup: []`, `pool: 'forks'`, `fileParallelism: false`, `testTimeout: 15000`, with the existing `@` alias. A transient resolver substituted only the existing vision tests' `seedCircle` import with an in-memory fixture implementing entitlement read/upsert and user-plan read, so the real gate and revocation logic still ran. No runner/config file was persisted. This is **not a new Postgres/RLS integration run**; the standard global setup applies migrations/policies and was deliberately not invoked.
- **Types/environment:** scoped TypeScript checking passed for all four vision root files plus transitive imports, using existing compiler options with `noEmit` and `incremental: false`. Full-repository `tsc --noEmit --incremental false` reported 14 errors, all in out-of-scope `tests/ledger/transitions.test.ts`; none were repaired here. Runtime was Node **24.18.0**, Vitest **5.0.5**, sharp **0.35.5**; a read-only `Win32_LogicalDisk` query confirmed **NTFS** on the local test drive. Oracle/Linux, other filesystems, multi-process contention, and live SAM/provider behavior were not tested.

## Original delivery red/green evidence (historical)

The original delivery below used the existing real Postgres setup and real filesystem/sharp. Only external person/SAM services were faked; gate/DB/compositor/media internals were not mocked. That Postgres evidence was not rerun in this scoped follow-up.

Observed behavior reds, followed by greens:

- Off gate: expected `CapabilityOffError`, got the initial `vision_not_implemented` scaffold; then 1/1 green.
- Two-cutout extraction: missing implementation; then 2/2 green with actual decoded PNG pixels.
- PERSON fixture: expected zero candidates/no directory, got two stored cutouts; then 3/3 green.
- Bad person outputs: 5 failures; then 8/8 green, SAM never called on invalid precheck.
- Bad SAM batch: 8 failures including mismatched dimensions/hidden outside-box pixels; then 16/16 green, no partial writes.
- Direct card compositor: person pixels returned; then 18/18 green with transparent RGB-zero verification.
- Media bounds/junctions: 6 failures; then 24/24 green.
- Mid-flight consent revocation: 2 failures; then 26/26 green.
- Demo opt-in/default error/provider isolation: 5 failures; then 31/31 green.
- Ranking/retry: 2 failures; then 33/33 green.

Final standard runner: `vitest run tests/vision tests/entitlements/gate.test.ts` — **57 passed** (46 vision + 11 existing entitlement tests), 3 files. `tsc --noEmit --incremental false` — **passed**. The initial transient Vite startup error during a concurrent config rewrite was not counted as a behavioral red; the gate test was rerun to obtain the actual assertion failure.

Ten deterministic original pixel-art PNG fixture variants are generated from committed `tests/fixtures/vision/synthetic.ts`; fixtures 8 and 9 include a synthetic PERSON region and prove zero cutout storage. These are repeatable synthetic boundary fixtures, **not** ten real photos or evidence of 80% visually clean live SAM segmentation.

## SAM protocol verification and remaining live gap

Public documentation and npm metadata were read, without model/API-key calls:

- https://dev.meta.ai/docs/sam/overview documents `POST /v1/responses`, `model: 'sam-3.1'`, user message content containing `input_text` and `input_image`, `stream: true`, and `metadata: { mask_encoding: 'one_bit' }`.
- SAM output is special-token grammar in streaming Responses events, not an invented JSON mask API. The examples use `parseImageStream(events).finalResult`, `recordsOfKind(result.records, 'mask')` and `decodeMaskToRaster(record.mask)`.
- `npm view @meta-sam/parser version exports dist.tarball --json` confirmed **0.1.0** and published JS/type exports. The npm README and https://unpkg.com/@meta-sam/parser@0.1.0/dist/index.d.ts also expose the parser functions. **The parser exists; it is not unavailable.**

Not verified here: live key access/ZA availability, Spark person-box structured-output behavior/recall, real Responses SSE handling, box/mask association, cropped-raster offset placement into the normalized source frame, or the parser against an actual owned-photo SAM response. There is no handwritten token decoder and no pretend hosted SAM adapter. Person exclusion is proven against supplied detected boxes; real detector false negatives and photographic quality are not proven.

## Parent integration and dependencies

Current implementation requires **`sharp@0.35.5`** (the installed version used by these tests) and Node built-ins only. It does not require satori or resvg. No dependency files were edited. When wiring the real SAM provider, use **`@meta-sam/parser@0.1.0`**, not a regex/guessed-mask decoder; it is not imported by this delivery.

Parent integration remains: implement/verify the live Spark and SAM adapters with bounded transport/parser budgets, map their output to the public raster contract, bind actor-authorized ingestion media, persist candidate state/model evidence, and reuse `renderMaskedCutout` in the card module. Ingest redelivery deduplication must happen **before** this function; file retries are safe but external calls are intentionally not cached, so this function alone does not meet F11's no-second-SAM-call redelivery criterion. Run the real-photo cleanliness benchmark before claiming the feature live. This worker's changes remain uncommitted for the parent to integrate as requested.
