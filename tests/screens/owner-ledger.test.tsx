import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { OwnerLedgerScreen } from '@/components/screens/owner-ledger';
import type { OwnerCircleView } from '@/server/views';

it('PUBLIC: renders literal owner wishes and navigation without friend or intake activity', () => {
  const view: OwnerCircleView = {
    name: 'The moon picnic',
    occasion: 'Birthday picnic',
    eventDate: '2026-11-03',
    eventDateLabel: 'Tue 3 Nov',
    countdown: '12 days to go',
    birthday: '3 Apr',
    shareSlug: 'moon-picnic',
    items: [
      {
        id: 'wish/one',
        title: 'Blue enamel kettle',
        retailer: 'Example outdoor shop',
        price: 'R1 249.50',
        confirmed: true, hasPhoto: false,
      },
      {
        id: 'wish-two',
        title: 'A sky map',
        retailer: null,
        price: null,
        confirmed: false, hasPhoto: false,
      },
    ],
    attributes: [
      { kind: 'shoe_size', valueText: '43', unit: 'EU' },
      { kind: 'colour', valueText: 'Ocean blue', unit: null },
    ],
    accessRequests: [],
  };
  const forbiddenFields = {
    claimCount: 'PRIVATE_CLAIM_COUNT',
    claims: 'PRIVATE_CLAIMS',
    pool: 'PRIVATE_POOL',
    pools: 'PRIVATE_POOLS',
    suggestions: 'PRIVATE_SUGGESTIONS',
    entitlements: 'PRIVATE_ENTITLEMENTS',
    friends: 'PRIVATE_FRIENDS',
    members: 'PRIVATE_MEMBERS',
    visitorCount: 'PRIVATE_VISITORS',
    cardEntries: 'PRIVATE_CARD_MESSAGES',
    contributions: 'PRIVATE_CONTRIBUTIONS',
    claimedByMe: 'PRIVATE_CLAIMED_BY_ME',
    secret: 'PRIVATE_SECRET_FLAG',
    addedByMe: 'PRIVATE_ADDED_BY_ME',
    status: 'UNPROJECTED_ITEM_STATUS',
    tombstoneReason: 'UNPROJECTED_TOMBSTONE_REASON',
    intakeStatus: 'UNPROJECTED_INTAKE_STATUS',
    eventDateSetByUserId: 'PRIVATE_DATE_WRITER',
    eventDateSetBy: 'PRIVATE_DATE_WRITER',
  };
  // Extra runtime properties must neither be read nor be serialized into the owner page.
  for (const target of [view, ...view.items]) {
    for (const [key, sentinel] of Object.entries(forbiddenFields)) {
      Object.defineProperty(target, key, {
        enumerable: true,
        get() { throw new Error(`Owner screen read ${sentinel}`); },
      });
    }
  }

  const html = renderToStaticMarkup(createElement(OwnerLedgerScreen, {
    view,
    basePath: '/owner/moon-picnic',
  }));

  for (const literal of [
    'The moon picnic', 'Birthday picnic', '2026-11-03',
    'Blue enamel kettle', 'Example outdoor shop', 'R1 249.50', 'A sky map',
    'Shoe size', '43', 'EU', 'Colour', 'Ocean blue',
    'On your list', 'Check and confirm', 'Price not added',
  ]) {
    expect(html).toContain(literal);
  }
  expect(html).toMatch(/<h1\b[^>]*>Your wishes<\/h1>/);
  expect(html).toMatch(/<p class="pn-context-name">The moon picnic<\/p>/);
  expect(html).toContain('<time dateTime="2026-11-03">Tue 3 Nov</time> · 12 days to go');
  expect(html).toContain('Birthday: 3 Apr');
  expect(html).toMatch(/<a\b[^>]*href="\/owner\/moon-picnic\/draft"[^>]*>Add a wish<\/a>/);
  expect(html).toContain('href="/owner/moon-picnic/items/wish%2Fone"');
  expect(html).toContain('href="/owner/moon-picnic/items/wish-two"');
  expect(html).toContain('href="/owner/moon-picnic/settings"');
  expect(html).toContain('href="/c/moon-picnic"');
  expect(html).toContain('Review a draft');
  expect(html).toContain('After a voice note becomes a draft');
  expect(html).toContain('check the title and price before you confirm');
  // The owner ledger is links and display, with exactly one exception: the native party-date form.
  expect(html).toMatch(/<form\b[^>]*action="\/owner\/moon-picnic\/date"[^>]*method="post"/);
  expect(html.match(/<form\b/g)).toHaveLength(1);
  expect(html.match(/<button\b/g)).toHaveLength(1);
  expect(html).toMatch(/<button\b[^>]*type="submit"[^>]*>Save the date<\/button>/);
  expect(html).toMatch(/<input\b[^>]*name="eventDate"[^>]*\/>/);
  expect(html).toContain('id="event-date" type="date"');
  expect(html).not.toMatch(/\bhref="#"|<script\b/);
  expect(html).toContain('href="#pn-content"');
  expect(html).toContain('id="pn-content"');
  expect(html).not.toMatch(/claimed|pooled|pledged|contributors|suggestions|entitlements|visitors|friends online/i);
  for (const sentinel of Object.values(forbiddenFields)) expect(html).not.toContain(sentinel);

  const emptyHtml = renderToStaticMarkup(createElement(OwnerLedgerScreen, {
    view: { ...viewWithoutExtras(view), items: [], attributes: [], shareSlug: 'moon/picnic?invite' },
    basePath: '/owner/another-circle',
  }));
  expect(emptyHtml).toContain('No wishes yet');
  expect(emptyHtml).toContain('No sizes or preferences added yet.');
  expect(emptyHtml).toContain('href="/owner/another-circle/draft"');
  expect(emptyHtml).toContain('href="/owner/another-circle/settings"');
  expect(emptyHtml).toContain('href="/c/moon%2Fpicnic%3Finvite"');
  expect(emptyHtml).not.toContain('Blue enamel kettle');
});

it('PUBLIC: renders no event date to the owner when a friend wrote it, and keeps the form empty', () => {
  const blind: OwnerCircleView = {
    name: 'The moon picnic',
    occasion: 'Birthday picnic',
    eventDate: null,
    eventDateLabel: null,
    countdown: null,
    birthday: '3 Apr',
    shareSlug: 'moon-picnic',
    items: [],
    attributes: [],
    accessRequests: [],
  };
  const markup = renderToStaticMarkup(createElement(OwnerLedgerScreen, { view: blind, basePath: '/owner/moon-picnic' }));
  expect(markup).not.toMatch(/<time\b|days to go|>Today<|>Tomorrow<|day has passed/);
  expect(markup).toContain('Birthday: 3 Apr');
  // The owner can still write the date; the field just carries no value to leak.
  expect(markup).toMatch(/<form\b[^>]*action="\/owner\/moon-picnic\/date"[^>]*method="post"/);
  expect(markup).not.toMatch(/value="2\d{3}-\d{2}-\d{2}"/);
});

it('PUBLIC: re-renders the rejected draft instead of emptying the field', () => {
  const markup = renderToStaticMarkup(createElement(OwnerLedgerScreen, {
    view: { ...viewWithoutExtras(ownerView()), eventDate: null, eventDateLabel: null, countdown: null },
    basePath: '/owner/moon-picnic',
    notice: 'Enter a real date, in the form 2026-12-05.',
    eventDateDraft: '18/11/2026',
  }));
  expect(markup).toContain('Enter a real date, in the form 2026-12-05.');
  expect(markup).toContain('value="18/11/2026"');
});

function ownerView(): OwnerCircleView {
  return {
    name: 'The moon picnic',
    occasion: 'Birthday picnic',
    eventDate: '2026-11-03',
    eventDateLabel: 'Tue 3 Nov',
    countdown: '12 days to go',
    birthday: '3 Apr',
    shareSlug: 'moon-picnic',
    items: [],
    attributes: [],
    accessRequests: [],
  };
}

function viewWithoutExtras(view: OwnerCircleView): OwnerCircleView {
  return {
    name: view.name,
    occasion: view.occasion,
    eventDate: view.eventDate,
    eventDateLabel: view.eventDateLabel,
    countdown: view.countdown,
    birthday: view.birthday,
    shareSlug: view.shareSlug,
    items: view.items,
    attributes: view.attributes,
    accessRequests: view.accessRequests,
  };
}
