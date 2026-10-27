# WhatsApp, intake, models and bounded tasks — 2026-10-27

## Delivery status and ownership

Implemented the requested public webhook and worker seams, bounded external adapters, strict model-to-draft pipeline, explicit demo fixtures, six-task routing and real DB/pg-boss wiring. **This is not a verified end-to-end WhatsApp/live-model delivery.** Production DB adapters are implemented and typechecked; valid-message ingestion, queue polling and ledger/card writes need the parent's serialized PostgreSQL integration run.

Workspace: `C:/Users/apsch/Documents/personal/gifts-registry`.

Changed only these assigned paths:

- `src/server/wa/{protocol,http,media,identity,store,queue,webhook}.ts`
- `src/server/models/client.ts`
- `src/server/intake/{voice,link,pipeline,process}.ts`
- `src/server/agent/{tasks,status,dispatch}.ts`
- `src/worker.ts`
- `tests/wa/{webhook,media,identity,factory,store}.test.ts`
- `tests/intake/{voice,models,link,pipeline}.test.ts`
- `tests/agent/{tasks,status}.test.ts`
- `tests/fixtures/whatsapp/media.json`
- `tests/fixtures/models/{bicycle-lamp,pcm16-silence}.json`
- This explicitly requested output document.

No package, environment contract, schema, policy, route, view, shared UI, config, CI or secret files were edited by this worker. No git commands, commits or pushes were performed; changes remain uncommitted for parent integration. Read ARCHITECTURE, SPEC F2/F3/F13, the existing env/gate/DB contracts, and the installed test-driven-development, llm-security and codebase-design skills. The llm-security skill's linked field-journal/tool-index files were absent; no bootstrap outside ownership was attempted.

## Exact public integration seams

From `C:/Users/apsch/Documents/personal/gifts-registry/src/server/wa/webhook.ts`:

```ts
createWhatsAppWebhook(db: Db): (request: Request) => Promise<Response>
// Also re-exports processIngest.
```

From `C:/Users/apsch/Documents/personal/gifts-registry/src/server/intake/process.ts`:

```ts
processIngest(db: Db, eventId: string): Promise<ProcessResult>
downloadIngestMedia(db: Db, eventId: string): Promise<void>
interface ProcessResult {
  status: 'parsed' | 'failed' | 'skipped';
  reply: string;
}
```

From `C:/Users/apsch/Documents/personal/gifts-registry/src/worker.ts`:

```ts
startIngestWorker(db: Db): Promise<() => Promise<void>>
```

Parent mounts GET/POST on a Node-runtime route without reading or parsing the request body first. All factory responses set `Cache-Control: private, no-store`. A successful POST returns `{ ok: true, reply?: string }`; failures are generic. **That JSON response is webhook acknowledgement, not a WhatsApp message send.** `ProcessResult.reply` and the actor-private stored reply are deterministic text for a separately authorized delivery/UI adapter.

Worker job contract: queue `whatsapp-ingest`, payload `{ eventId: <database UUID> }`. Invalid event IDs fail before DB access. `startIngestWorker` returns an async shutdown closure. Direct execution is supported through the existing TypeScript runner, e.g. `pnpm exec tsx src/worker.ts`, with environment already supplied. Parent owns a package script, process/compose lifecycle and configuration; none was added here.

## Draft/checkpoint contract

`ingest_events.draft` is an actor-private versioned record:

```ts
{
  version: 1,
  actorRole: 'owner' | 'friend', // written by trusted webhook adapter
  input: {
    kind: 'audio' | 'image' | 'url' | 'text',
    timestamp: number,
    mediaId?: string,
    mimeType?: string,
    text?: string,
    interactiveId?: string
  },
  transcript?: string,
  evidence?: ModelEvidence[],
  candidates?: CandidateDraft[],
  reply?: string
}

interface CandidateDraft {
  index: number;
  state: 'pending';
  title: string;
  brand: string | null;
  size: string | null;
  priceMinor: number | null; // integer cents, never a float
  currency: 'ZAR';
  canonicalUrl: string | null;
  imagePath: string | null;
}

interface ModelEvidence {
  model: string;
  mode: 'live' | 'demo_fixture';
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}
```

No item is created by intake. Parent's authenticated confirmation transition must verify event ownership/current circle, use corrected human-reviewed values, derive visibility from trusted role and create items only on explicit confirmation. `actorRole` is provenance, not authorization; the processor resolves current membership and the parser currently preserves this field without validating it against a historical role transfer.

Audio yields/persists `converted`, then `transcribed` with transcript/evidence, then `parsed` with a pending candidate. A saved transcript skips conversion/ASR on retry, but Spark is separately authorized again. There is currently one candidate per voice/link/screenshot. There is no per-candidate confirmation implementation in this worker.

Actual schema has no `demo_fixture` status. Demo rows use normal checkpoint statuses and `modelUsed = 'demo_fixture'`; each model evidence entry records `mode: 'demo_fixture'`. Live model counters are taken from provider usage when present, otherwise null, never fabricated. Metadata-only extraction uses `modelUsed = 'retailer_metadata'` and no model evidence.

## Enforced boundaries

- GET verification preserves the exact challenge, including leading zeros. POST validates `x-hub-signature-256` syntax and uses Node crypto HMAC-SHA256 plus `timingSafeEqual` over **raw bytes before JSON parsing**. Body limit 1 MiB, read deadline 5 seconds. Wrong signature is 403, valid-signature malformed JSON is 400, oversized input is 413.
- Cloud envelope/status handling is schema validated. Business phone ID is filtered when configured. Implemented BSUID fields are `messages.from_user_id` and a matching `contacts.user_id`; numeric `messages.from` is phone fallback only when no BSUID exists. No contact/circle guess or fallback from an unmatched BSUID to a phone is made.
- Identity resolution reads only identity/current membership data on the login role. Exactly one active, role-consistent membership in an active circle is required. Unknown or ambiguous senders get the same fixed menu; no user creation or auto-join occurs.
- The trusted ingest row is deduped by unique `waMessageId`. A short 5-second Prisma transaction upserts it and calls `boss.send` with `db: fromPrisma(tx)`, UUID job ID and singleton key. Queue startup precedes that transaction. Immediate media download follows commit.
- Processing is serialized with a session advisory lock, **not a DB transaction**. Network/process work occurs outside `withActor`. Capability checks use the existing gate in short real transactions; `modelsForActor` additionally rechecks active circle/membership and owner-role consistency before every model request. Retailer HTTP is also gated. Tests cover revocation between ASR and Spark through the approved consent boundary, not a fake transaction client.
- Live media metadata is fetched only from `graph.facebook.com`; supplied download URLs must use exact HTTPS host `lookaside.fbsbx.com`, with no userinfo/nonstandard port. Redirects are refused. Audio/image MIME allowlists, metadata and streamed-byte limits, Content-Length checks, request/body timeouts and empty-body rejection apply. HTML media is rejected even if metadata claims PNG/JPEG; binary/octet-stream responses remain supported.
- Media files use a validated DB UUID under trusted `MEDIA_DIR/ingest`, never WhatsApp/model/user filenames. Writes use server-random private temporary files and rename after writing/fsync/close. Reads check regular-file size and actual streamed bytes.
- FFmpeg is spawned with `shell: false`, stdin/stdout pipes, fixed arguments for mono PCM16 16 kHz WAV, a 15-second deadline and output cap. The output RIFF/WAVE format is validated. No user-derived shell command or file argument exists.
- Voice uses `muse-voice-transcribe-1.0`, then independently gated `muse-spark-1.2`. Photo/link fallback uses Spark 1.2. The model endpoint is pinned to `https://api.meta.ai/v1`; image bytes are supplied as a bounded JPEG/PNG data URL, not a model-selected network URL.
- Wish JSON schema is flat, all six fields required, `additionalProperties: false`. Local validation rejects unknown action/state fields, fractional/out-of-range money, non-ZAR currency and non-HTTPS guessed URLs. Nonempty tool calls are rejected. Model output is data, never task/state selection.
- Explicit `DEMO_MODE=on` uses committed fictional model/media/WAV fixtures. Production passes the same explicit mode to the link pipeline, which skips retailer scraping in demo mode. Missing live model/WhatsApp keys fail closed; errors never switch to fixtures. The pure pipeline options and model config must use consistent modes, as the production adapter does.
- Retailer metadata is attempted before Spark in live mode, with exact allowlisted HTTPS retailer hosts, no redirects, bounded HTML and integer lexical price conversion. Supported hosts: Specialized, Takealot, Cape Union Mart and Sportsmans Warehouse, as listed in `intake/link.ts`.

## Six-task surface

SPEC F13 is authoritative; the task names are exactly:

1. `add_by_voice`
2. `add_by_photo`
3. `add_by_link`
4. `check_status`
5. `claim_or_pool` with `claim`, `join_pool` or `not_now`
6. `write_card_message`

Audio/image/URL message types route intake. Other tasks require strict explicit interactive JSON payloads; ordinary free text, unknown tasks and extra fields always return the same AI-labelled fixed menu. No model selects a task. No general chat, assistant model response, payment call, automatic card delivery or reveal send exists.

Status is deterministic: the owner receives wants/unconfirmed counts only; friend context receives still-unclaimed item titles. Role routing is explicit; no friend projection is handed to an owner. Claim/contribute dispatch calls the existing ledger transitions in the same short actor transaction as the ingest completion update. Contributions are promises/manual settlement, not held money.

Card tasks reuse the existing 200-Unicode-codepoint/no-URL validator and contributor checks. Unconfirmed input returns an actor-only preview. Explicit `confirmed: true` can create that actor's card entry and ledger event. Existing identical entries are acknowledged; different text/anonymity/display name returns a truthful conflict without overwriting or claiming the submitted line was saved. No recipient receives anything automatically.

This is an intent/dispatch contract, not a verified live 3-button/card-text conversation. Parent must establish and verify the transport/conversation binding before presenting it as that UX.

## Genuine test evidence

Final isolated run at 00:42:28: **36/36 tests passed, 11/11 files passed**. Full-repository `tsc --noEmit --incremental false` passed with exit 0. Earlier complete runs passed 31/31 and 33/33; three real-filesystem storage tests increased the final count to 36.

Tests used pure/public HTTP and pipeline behaviors with external HTTP, consent and FFmpeg-runner fakes. Storage tests use real Windows temporary directories, file handles, reads, rename and cleanup, with synthetic bytes; invalid JS-boundary data induces an actual writeFile error. Factory tests instantiate a real Db/Prisma/Pool pointed at loopback port 1 and exercise only paths that must not query/connect. **No fake Prisma transaction was used, and no database-mutating tests ran.** The shared global setup was deliberately disabled while the ledger worker used the integration DB.

Behavioral reds actually observed before minimal greens:

| Slice | Observed red | Green evidence |
| --- | --- | --- |
| Verification | Empty challenge instead of `000123` | Challenge/factory tests pass |
| Signature order | Forged malformed body returned 200 rather than 403 | Wrong-signature and signed malformed JSON cases pass |
| Cloud normalization | Valid BSUID message returned a Response rather than normalized message | BSUID-only fixture case passes |
| Bounds | Spoofed media host accepted; oversized media accepted; signed oversized webhook returned 400 rather than 413 | Host/stream/webhook tests pass |
| Consent | Off authorization returned success; metadata still fetched when consent was off | Model/pipeline gate tests pass |
| Voice | Converter never invoked; malformed WAV accepted | Fixed argv and WAV refusal tests pass |
| Models | No draft/evidence; ASR returned no result; photo was text-only; explicit demo required key | Structured extraction, FormData, image input and demo tests pass |
| Pipeline | Wrong/missing checkpoints; link/photo unsupported | Shared pending candidate and resume tests pass |
| Tasks/privacy | Missing fixed menu, explicit F13/card-confirm intent rejected, trusted membership/status missing | Deterministic task/identity/status tests pass |
| Public worker seam | Malformed event ID accepted | Rejected before any DB query |
| Metadata gate follow-up | Pipeline resolved instead of `capability_off` at 00:28:49 | Pipeline 3/3 at 00:29:21 |
| Media demo follow-up | Explicit demo threw `whatsapp_not_configured` at 00:30:23 | Media 3/3 at 00:30:59 |
| Actual media MIME | Approved URL/PNG metadata with HTML body returned `accepted` at 00:36:34 | Media 4/4 in 31-test green run |
| Offline link demo | Explicit demo called retailer HTTP and threw `demo_must_not_fetch` at 00:38:05 | Pipeline 6/6 at 00:38:40 |
| Card conflict | Different previous line still returned `is saved` at 00:38:40 | Task 4/4 in the 33-test green run |
| Storage cleanup | Real failed write left a private UUID temporary file at 00:41:59 | Store 3/3 in final 36-test run |

Additional final regressions reject fractional price, extra model `action`, JavaScript URL output, and mid-job consent revocation; resume skips conversion/ASR. These latest cases passed on their first run against the existing implementation, so they are coverage, not claimed additional red/green slices. The card-conflict red/green is the pure deterministic acknowledgement seam; it is not evidence of real card persistence.

Reproduction from the workspace with Node >=24 and installed dependencies (no runner/config file required):

```sh
node --input-type=module -e 'import { startVitest } from "vitest/node"; const v = await startVitest("test", ["tests/wa","tests/intake","tests/agent"], {config: false, globalSetup: [], watch: false, fileParallelism: false}, {resolve:{alias:{"@":"C:/Users/apsch/Documents/personal/gifts-registry/src"}}}); const failed=v.state.getFiles().some(f=>f.result?.state==="fail"); await v.close(); process.exit(failed?1:0);'
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Actual commands used the Qoder-managed Node runtime with `ELECTRON_RUN_AS_NODE=1`; no host runtime path was persisted as a project script. The ordinary repository Vitest command invokes shared DB setup, unlike the isolated command above.

## Environment/dependency handoff

- No new npm dependency is required by this delivery: Node crypto/fetch/fs/spawn plus installed pg-boss/Zod/Prisma suffice. Installed pg-boss **12.38.0** APIs/types were read: named `PgBoss`, named `fromPrisma`, `start/createQueue/send/work/offWork/stop`, transaction adapter and array work callback. Compatibility is typechecked; runtime schema/queue behavior was not tested.
- `WHATSAPP_ACCESS_TOKEN` was requested from the parent before use and subsequently verified in the parent-owned env contract. This worker did not edit that contract. Live media also needs `WHATSAPP_GRAPH_API_VERSION`; webhook needs `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, and should configure `WHATSAPP_PHONE_NUMBER_ID` for business-number isolation.
- Models need `MODEL_API_KEY` and the existing `MODEL_API_BASE_URL`; exact model IDs are intentionally pinned as required, not arbitrary configurable task/model decisions.
- Operator must provide FFmpeg (`FFMPEG_PATH`) and an application-controlled writable media root (`MEDIA_DIR`, use an absolute production path). Parent owns container/service/environment updates. Base Db/session/circle env remains governed by the existing contract.
- Optional wrapper metadata was checked read-only: exact package `whatsapp-api-js@6.3.0`, MIT, repository `Secreto31126/whatsapp-api-js`. This is a Cloud API wrapper, not proof of Meta authorship/endorsement. It was **not installed or relied upon**; no unofficial WhatsApp protocol client was adopted.
- Do not add secrets to fixtures, this report, Git or logs. All committed-source fixtures are synthetic/fictional; no real names, phones or user messages were added.

## Unfinished integration and verification gaps

1. **No actual valid-message PostgreSQL evidence.** Parent must test signed ingestion, unique-message redelivery, atomic queue/event commit, advisory-lock contention, checkpoint persistence/retry, cached media, removed/ambiguous membership, capability changes, RLS status isolation and ledger/card writes in its serialized DB run. Installed API verification is not runtime queue evidence.
2. **No live protocol/inference evidence.** No real key, paid/model request, WhatsApp media request, outbound send or FFmpeg binary was exercised. ASR multipart fields `model`/`file` and response `{text}` are implemented assumptions validated against an external fake; endpoint/model/WAV choices came from repository research, not a live request. New BSUID fields are fixture-tested but not verified from a live webhook. Meta docs fetches did not establish those behaviors; `/docs` returned 404. Parent must verify against an actual authorized live response before claiming support.
3. Parent must mount the raw-body route and worker lifecycle, map actor-private candidates to confirmation UI/guarded item transitions and consume deterministic replies without leaking friend context. No sender session minting or route adapter was added here.
4. **No outgoing transport.** Fixed-menu/status/claim/card replies are not delivered by this code. Parent owns the safe in-window transport, BSUID addressing, actual button IDs/payload limits and human confirmation binding. No templated nudge/card/reveal automation should be added implicitly.
5. **F11 cutouts are not integrated.** Screenshot extraction currently returns one source-image draft through Spark (the F3 path). The separate vision worker exports a factory and deliberately refuses unverified live SAM. Parent must provide its verified person/SAM services, wire authorized source media, map multi-candidate state and model evidence, and benchmark real-photo quality. **A source `imagePath` is not a safe transparent product cutout; never use it as proof of person-pixel exclusion or advertise multi-gift extraction.**
6. Retailer metadata does not yet extract/download `og:image`/JSON-LD image; link candidates have `imagePath: null`. Only the static retailer allowlist is fetched. Unsupported retailers fail closed rather than arbitrary scraping.
7. Media lifetime cleanup is not scheduled here. Temporary cleanup now covers write/fsync/close/rename exceptions, with a real write-failure regression, but unlink errors are currently swallowed. Disk-full, fsync/close failures, crashes/power loss and hostile-local-filesystem symlink/race behavior were not tested. Keep MEDIA_DIR application-controlled and add bounded expiry cleanup/hardening before treating it as an adversarial shared filesystem.
8. Card persistence/status production adapters have no new real RLS regression evidence in this assignment. Historical role-transfer handling also needs parent review: stored actorRole is provenance only and source drafts must remain appropriately private.

Do not claim live Meta usage, outbound delivery, multi-cutout/person safety, complete F13 conversation UX or full end-to-end readiness from these offline boundary tests.

## Parent integration and additional security review — 2026-10-27

The preceding sections preserve the worker's original scope. Parent integration now mounts raw GET/POST `/api/wa/webhook`, adds `pnpm worker`, and maps version-1 actor-private candidates to native human confirmation. Ten real PostgreSQL intake tests pass: signed redelivery commits one event/job; business-number mismatch is ignored; explicit-demo media is acquired immediately; gated conversion/transcription/extraction checkpoints persist; photo opt-out refuses acquisition; owner status excludes coordination; strict claim intent is atomic and free text stays menu-only; event locks serialize and release after work failure; concurrent locks retain actor-query capacity; removed membership refuses processing; the actual worker polls/completes a committed job and shuts down. Native confirmation creates one correctly scoped item and rejects cross-actor drafts.

An additional read-only general-purpose security worker read the complete WA/intake/models/agent surface and supporting DB/gate code. No runtime/provider/DB operations, source edits or subagents were delegated to that reviewer. It returned two verified High findings, both subsequently reproduced by the parent on isolated PostgreSQL:

| Finding | Location and impact | Repair and evidence |
| --- | --- | --- |
| High: lock/query pool starvation | `src/server/db/client.ts` / `src/server/wa/store.ts`: long session locks borrowed from the query pool while their work needed another connection, blocking actor transactions. | Separate two-connection advisory pool from ten-connection Prisma pool; bounded acquisition, both closed on shutdown. Failed unlock discards the session. The regression holds nine primary connections and processes twelve distinct locks with actor queries; it failed before and passed after separation. |
| High: inherited expiry undoes consent | `src/server/entitlements.ts`: a user toggle retained a grant's expiry, and expired rows fell back to a granting plan, undoing the opt-out. | User-source choices prevail regardless of inherited expiry; create/update clears expiry. Three real DB cases failed before: past grant, future grant retaining expiry, and existing expired user opt-out. All pass after the fix; expired non-user grants still fall back. |

The initial regression run had **4 failures / 24 cases**. The repaired focused run passed **24/24** (14 gate, 10 intake); the final assembled run passed **393/393 across 34 files**, typecheck, production build and **10/10 production Chromium flows**. Mounted browser checks preserve challenge `000123`, reject missing/forged signatures before parsing and create no event. No policies were removed to produce the security reds.

The reviewer found no additional verified identity bypass, prompt-driven transition, secret exposure or media SSRF in its bounded scope. This is not a full-system approval or live API certification. Original live transport, SAM/multi-candidate binding, possession-verifying login, media cleanup and deployment gaps remain. Conversion uses a runner fake; no actual FFmpeg binary or paid/live provider was exercised.
