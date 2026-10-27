# Friend ledger screen output

## Delivered

- `src/components/screens/friend-ledger.tsx` exports `FriendLedgerScreen({ view: FriendCircleView, basePath: string })`.
- Uses the real friend projection for circle details, titles, retailer, nullable price, personal claim/suggestion/buyer indicators, friend-only marker and supplied attributes/units.
- Shows exact item and pool statuses with underscores replaced by spaces and sentence-case labels. `funded` remains the status **Funded**, never the label for the amount received.
- Pool money is labelled **Settled** and **Pool target**, using the supplied formatted strings unchanged. No promises, pledged totals, inferred progress, savings, contributor/member counts or claimant identities.
- Tombstoned items retain their claim/pool details and humanized reason. Pivot notice directs friends to decide together on the item page; it performs no transition.
- Native links use `${basePath}/items/${item.id}`, `${basePath}/draft` and `${basePath}/settings`. No actions, routes, model calls or mutations are implemented here.
- Uses shared `Screen`, `Panel`, `Badge` and only the assigned semantic `pn-*` hooks in screen-authored markup. Empty states, section headings, definition lists, descriptive item links and text status labels are included.

## Verification actually run

- Test first: authored `tests/screens/friend-ledger.test.tsx`, then rendered a minimal implementation showing only the circle name. Vitest 5.0.5 executed **15 tests, 15 assertion failures**. This was a real behavioral red, not a missing shared-module/import failure.
- Implementation run against the real shared UI: **9 passed, 6 failed**. The test text helper had included decorative aria-hidden badge glyphs, and the date attribute assertion assumed lowercase serialization. Corrected those assertions without weakening the status/settled requirements.
- Final run: **15 passed, 0 failed**, through `ReactDOMServer.renderToStaticMarkup`; no shared component mocks, database or model calls.
- Owned screen/tests and their imports pass a scoped TypeScript compiler check with `noEmit` and `incremental: false`.
- Full workspace TypeScript check failed outside ownership: shared primitive prop mismatches in `card-composer.tsx` and `item-detail.tsx`, plus a missing `releaseClaim` export used by `tests/ledger/transitions.test.ts`. No errors were reported for this screen/test; unrelated files were left alone.
- Owned-file whitespace check passed.

The isolated Vitest run used `startVitest` with `config: false`, Node environment, `include: ['tests/screens/friend-ledger.test.tsx']`, `globalSetup: []`, and an `@` alias resolving to `src`. This avoids running the repository's database global setup for a public static-render unit test. No configuration files were changed by this worker.

## Integration requirements and limits

- The parent must authenticate and select the **friend** projection before mounting this screen. This component is presentation, not an authorization boundary; never hand it an owner projection or an unfiltered database record.
- Supply `basePath` without a trailing slash and implement the three linked destinations. The existing `/c/<slug>` role adapter remains parent-owned.
- The shared UI module was initially missing and arrived before the implementation test run; it is now a verified dependency, not a stub.
- The parent owns global V7 light styling and responsive semantic hooks. At this worker's CSS inspection, `globals.css` had V7 tokens but no `pn-grid`, `pn-between`, `pn-item`, `pn-banner` or `pn-note` rules. Those styles, wrapping/reflow and visible focus must be supplied and checked at integration; no CSS outside ownership was edited.
- The repository Vitest config now includes `.tsx` tests, but still has database global setup. Keep static screen tests runnable without database setup through the parent-owned runner configuration.
- The literal fixture proves the friend-only suggestion is rendered for a friend and that the settled values/status labels are correct. It does not establish end-to-end RLS or owner-route privacy; those remain projection/route test responsibilities.
- **No browser, screenshot, automated accessibility scanner, keyboard, 320px reflow, zoom or assistive-technology testing was performed.** Static markup review alone is not a WCAG compliance claim.
- Only the three assigned files were written. No package, configuration, route, secret, git staging, commit or push changes were made by this worker. The files remain uncommitted for parent integration as requested.
