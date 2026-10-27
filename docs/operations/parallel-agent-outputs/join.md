# Join screen output

## Scope

Only `src/components/screens/join.tsx`, `tests/screens/join.test.tsx`, and this report are owned by this worker. No route, shared UI, package, git, configuration, secret, or live-account changes.

## Implementation

- Named export `JoinScreen({ notice?: string, action?: string })` and exported `JoinScreenProps`.
- Empty default action posts to the current URL without embedding a circle slug. Native POST fields match `handleCirclePost`: required `name` (max 80) and required `phone` (`tel`, max 20).
- Generic invite-list gate; no circle/projection props, no prefilled identity, no OTP or number-possession claims. Explicitly says invite-list matching does not verify control of the number.
- Shared `Screen` supplies `Brand`; the screen uses shared `Panel`, `Button`, `Field`, and `Badge`, with only the approved semantic classes. V7 styling is delegated to the brand worker.

## Test evidence

All times below are local on 2026-10-27. Vitest 5.0.5 using bundled Node 24.18.0, `react-dom/server` public rendering, no mocks. Programmatic Vitest invocation uses `config: false`, the `@` source alias, node environment, and only `tests/screens/join.test.tsx`. This avoids importing dotenv or running the database global setup. No network/database calls were made.

- 00:02:54: setup failure, 0 tests executed, because shared `@/components/ui` did not exist. This is **not** a behavioral red.
- 00:03:38: valid red, 1 test executed and failed because the rendered gate had no native POST form.
- 00:04:24: implemented gate renders; the test now fails because shared `Field` omits `autocomplete="name"`. Its telephone input also currently omits `autocomplete="tel"`.
- 00:06:35: final run **3 passed, 1 failed**. Passing tests independently prove identical public HTML with private projection/identity props, escaped alert notices, and explicit POST action support. The form contract test remains red on missing shared autocomplete. No green claim is made for that test.
- Focused TypeScript compiler check of both assigned code files and their imports: **passed**, with no emit or incremental output.
- Whole-repository typecheck: blocked by unrelated errors in `src/server/cards/render.ts` and `tests/cards/render.test.ts` (fontBuffers, argument count, bleedMm, and CardEntryInput). None were in this worker's files; none were changed.
- Assigned files remain uncommitted because git changes are explicitly outside this worker's scope.

The isolated runner used `startVitest([root + '/tests/screens/join.test.tsx'], { config: false, root, run: true, include: ['tests/screens/join.test.tsx'], environment: 'node', pool: 'forks', fileParallelism: false }, { resolve: { alias: { '@': root + '/src' } } })`, with `root` set to this repository's absolute path. The runner closes its context and sets a failing exit code when any file or unhandled error fails.

## Integration needs

**Blocking green:** `src/components/ui.tsx` belongs to the brand worker. Its `Field` currently has no autocomplete support. Required shared behavior: derive `autoComplete="name"` for `name="name"` and `autoComplete="tel"` for telephone fields, within the agreed Field contract. No shared file was changed here and the assertions have not been weakened. Final green evidence is pending this dependency.

**Route integration:** replace the existing gate renderer with this screen, keep action omitted/empty for `/c/<slug>`, and supply only generic server-controlled notices. Preserve the route's existing origin check, `private, no-store` headers, and generic noindex metadata. This standalone screen does not prove allowlist, session, RLS, or HTTP-header behavior.

**Presentation/accessibility integration:** shared semantic CSS was not present at the last inspection; the brand worker owns it. The screen uses native form controls via Field, associated labels and hint IDs, a native submit button, and a text alert for notices. Browser reflow, focus, contrast, automated axe, and screen-reader checks were not run; no complete WCAG or visual-verification claim is made.
