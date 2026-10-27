# Draft confirmation screen output

## Owned files

- `src/components/screens/draft-confirm.tsx`
- `tests/screens/draft-confirm.test.tsx`
- `docs/operations/parallel-agent-outputs/draft-confirm.md`

No shared UI, route, service, dependency, configuration, secret or git-state edits were made by this worker. Changes remain uncommitted as requested.

## Public contract and behavior

Exports `DraftScreenData` and `DraftConfirmScreen({ draft, basePath, role, notice })` with the requested types. Uses the real `@/components/ui` Screen, Panel, Button, Field and Badge, and the existing `formatMinor` helper. Screen-authored classes are limited to the approved `pn-*` semantic vocabulary; no local CSS, inline styles, font changes or new assets.

- A supplied draft is unconfirmed, with editable title, retailer and price. Nothing is added until the person presses **Confirm and add item**. There are no model calls, client effects, automatic submissions or state transitions.
- A null draft explicitly says **Manual entry**, explains that no WhatsApp draft is loaded, and provides blank fields. An id-less supplied draft is still described as an unconfirmed draft, not as a processed voice note.
- Title is required and limited to 200 characters. Retailer and price are optional. Price uses a native number input, minimum 0, step 1, and the literal label **Price in cents (ZAR)**. Zero is preserved; unknown money stays blank. The cents example is instructional, not a live price preview.
- Friend additions submit `friend_only` and explain that the recipient will not see the item. Owner additions submit `owner_visible`; runtime extra claims, pools and contribution fields are never read or serialized.
- Non-ZAR drafts retain their currency in the hidden field, leave the ZAR price blank, show a reason, and disable confirmation rather than relabel foreign money. The server must independently reject non-ZAR requests.
- Notices are escaped text in a status region. The optional `source` is accepted in the data contract but is neither displayed nor submitted; provenance remains authoritative on the ingest event.
- WhatsApp copy describes the conditional, configured flow: send a voice note, product screenshot or retailer link to the business number; intake creates a reviewable draft. There is no invented phone number, WhatsApp link, processing status or connection claim.

## Actual test evidence

Executed with Vitest 5.0.5 and ReactDOMServer `renderToStaticMarkup`, in the Node environment, using the real shared UI without mocks.

1. Tests were written before the screen. The initial missing-module run had zero executed tests and is not behavioral red evidence.
2. Added only the exported types and a null-returning screen: **15 tests executed, 15 failed**. Failures covered missing confirmation copy, form controls, payload, editable corrections, manual entry, privacy, labels and WhatsApp explanation.
3. Implemented the screen: **14 passed, 1 failed** because the HTML test helper assumed lowercase `maxlength` while React serialized `maxLength`. Made HTML attribute matching case-insensitive.
4. Final focused run: **15 passed, 0 failed**.
5. Scoped TypeScript compiler check of both owned TSX files and their imported dependencies: **passed**.

The focused runner used `startVitest` with `config: false`, `run: true`, `include: ['tests/screens/draft-confirm.test.tsx']`, the existing `@` alias pointing to `src`, Node/forks, and both caches disabled. This avoided invoking database global setup or modifying configuration. At initial inspection the repository config included only `tests/**/*.test.ts`; normal CI discovery requires TSX inclusion and a suitable screen-test project. Other workers may be changing that configuration concurrently.

The whole-repository `tsc --noEmit --incremental false` invocation failed at the time checked on out-of-scope errors:

- `src/server/cards/render.ts:77`: `fontBuffers` was not recognized in the renderer font options type.
- `tests/ledger/transitions.test.ts:3`: the ledger module had no exported `createPool`.

No fixes were attempted outside ownership. These are observed failures, not assertions about the final state of parallel work.

Correction tests verify editable native controls, one submitted field per editable value, corrected server-rendered defaults and a retained ingest id. They do not simulate typing or execute an HTTP POST. Static tests also verify label associations, linked price help, escaped data/notices, optional values, role-specific visibility and absence of automatic confirmation.

## Form payloads

Action is exactly `POST ${basePath}/draft` using the native form encoding. The named fields are:

| Field | Rendered value / requirement |
|---|---|
| `intent` | Hidden `confirm` |
| `title` | Editable, required, max 200 |
| `retailer` | Editable; blank means unknown |
| `priceMinor` | Editable integer cents; blank means unknown |
| `currency` | Hidden draft currency, or `ZAR` for manual entry |
| `visibility` | Hidden `owner_visible` for owner; `friend_only` for friend |
| `ingestEventId` | Hidden only when a nonempty draft id is supplied |

Example reviewed owner fields: `intent=confirm`, `title=Cycling shoes, size 44`, `retailer=Corrected shop`, `priceMinor=219900`, `currency=ZAR`, `visibility=owner_visible`, `ingestEventId=ingest-demo-1`.

A friend sends the same reviewed fields with `visibility=friend_only`. A manual item sends the six non-ingest fields, for example `title=Gift idea`, `retailer=`, `priceMinor=`, `currency=ZAR`; it does not fabricate an ingest event. Examples are contracts inferred from rendered controls, not captured network requests.

## Integration requirements

- Mount the screen on the authenticated circle's draft route. Derive `basePath` and `role` from trusted route/session state, not submitted data.
- Supply only the authenticated adder's authorized draft in that circle. Never fetch a friend's draft for an owner; the component cannot repair an already-leaked title or notice. Owner notices must also be owner-safe.
- The GET and POST responses require **`Cache-Control: private, no-store`**. The component does not set HTTP headers. Do not add draft content to link previews.
- POST must enforce session/circle authorization and same-origin CSRF protection, validate `intent`, trim and validate title length, normalize empty optional fields to null, and reject negative, fractional, unsafe or unsupported-currency money. Native validation and disabled buttons are not security boundaries.
- Derive persisted visibility from the authenticated role. Do not trust the hidden visibility field. Verify any ingest id belongs to the authenticated adder and circle before loading or confirming it.
- Create the item only after explicit POST confirmation, with the corrected values, through the guarded/idempotent ingest transition. Manual entry must be a legitimate no-ingest path. Retain URL/image/provenance from the authorized ingest record rather than trusting extra posted fields.
- On validation failure, re-render corrected input data and an owner-safe `notice`; on success, redirect using the normal route flow. `notice` has no field-error schema, so field-specific invalid states remain a route/UI-contract concern.
- Model-producing intake belongs to the webhook/worker, behind `can(actor, capability)`, before any spend. Supply actual parsed data, or null plus a truthful degradation notice; do not pass fixtures as evidence of live extraction.
- Single-event confirmation is represented by the supplied id. Multi-candidate selection/dismissal needs a separate agreed route contract; no candidate identifier was invented here.
- The shared UI/CSS owns V7 white/pink/blue tokens, fonts, reflow and focus treatment. No browser, axe, screen-reader, 320px reflow, visual, live WhatsApp or end-to-end success is claimed by this output.
