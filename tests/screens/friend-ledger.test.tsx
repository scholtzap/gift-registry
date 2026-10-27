import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FriendLedgerScreen } from '@/components/screens/friend-ledger';
import type { FriendCircleView } from '@/server/views';

// Literal friend projection: no database, model calls, or real people.
const friendView: FriendCircleView = {
  name: "Nadia's 30th",
  occasion: 'birthday',
  eventDate: '2026-12-05',
  eventDateLabel: 'Sat 5 Dec',
  countdown: '12 days to go',
  birthday: '3 Apr',
  items: [
    {
      id: 'trail-runners',
      title: 'Trail runners, burnt orange',
      retailer: 'SuperSport',
      price: 'R1 899.00',
      status: 'active',
      tombstoneReason: null,
      secret: false,
      addedByMe: false,
      claimedByMe: false,
      canReveal: false,
      pool: null,
    },
    {
      id: 'secret-grinder',
      title: 'Coffee grinder',
      retailer: 'Coffee shop',
      price: 'R4 200.00',
      status: 'active',
      tombstoneReason: null,
      secret: true,
      addedByMe: true,
      claimedByMe: true,
      canReveal: false,
      pool: {
        id: 'grinder-pool',
        target: 'R4 200.00',
        settled: 'R700.00',
        targetMinor: 420000,
        settledMinor: 70000,
        currency: 'ZAR',
        status: 'open',
        iAmBuyer: true,
        contributors: 713,
      },
    },
    {
      id: 'tombstoned-pan',
      title: 'Copper pan',
      retailer: null,
      price: null,
      status: 'tombstoned',
      tombstoneReason: 'bought_self',
      secret: false,
      addedByMe: false,
      claimedByMe: true,
      canReveal: false,
      pool: {
        id: 'pan-pool',
        target: 'R2 400.00',
        settled: 'R350.00',
        targetMinor: 240000,
        settledMinor: 35000,
        currency: 'ZAR',
        status: 'pivot_needed',
        iAmBuyer: false,
        contributors: 829,
      },
    },
  ],
  attributes: [
    { kind: 'shoe_size', valueText: 'UK 6', unit: 'shoe' },
    { kind: 'ring_size', valueText: 'N58', unit: 'ring' },
    { kind: 'colour', valueText: 'burnt orange', unit: null },
  ],
};
const basePath = '/c/nadia-30th';

function render(view: FriendCircleView = friendView, path = basePath) {
  return renderToStaticMarkup(createElement(FriendLedgerScreen, { view, basePath: path }));
}

function text(markup: string) {
  // Badge glyphs are decorative, not part of the accessible status label.
  return markup
    .replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function itemMarkup(markup: string, title: string) {
  const article = markup.match(/<article\b[^>]*>[\s\S]*?<\/article>/g)?.find((item) => item.includes(title));
  expect(article, `an item article for ${title}`).toBeDefined();
  return article!;
}

function withPoolStatus(status: string): FriendCircleView {
  const item = friendView.items[1]!;
  return {
    ...friendView,
    items: [{ ...item, pool: { ...item.pool!, status } }],
  };
}

describe('FriendLedgerScreen public static render', () => {
  it('shows real item details and the private suggestion in the friend projection', () => {
    const markup = render();
    const grinder = itemMarkup(markup, 'Coffee grinder');
    expect(text(markup)).toContain('Friends only');
    expect(text(markup)).toContain('Keep this ledger away from the gift recipient.');
    expect(text(markup)).toContain('birthday');
    expect(markup).toMatch(/<time dateTime="2026-12-05">Sat 5 Dec<\/time> · 12 days to go/i);
    expect(text(markup)).toContain('Birthday: 3 Apr');
    expect(text(itemMarkup(markup, 'Trail runners, burnt orange'))).toContain('R1 899.00');
    expect(text(grinder)).toContain('Coffee shop');
    expect(text(grinder)).toContain('R4 200.00');
    expect(text(grinder)).toContain('Friend-only suggestion');
    expect(text(grinder)).toContain('You suggested this');
    expect(text(grinder)).toContain('Claimed by you');
    expect(text(grinder)).toContain('You are the buyer');
    expect(text(itemMarkup(markup, 'Trail runners, burnt orange'))).not.toMatch(/Claimed by you|You are the buyer|You suggested this|Friend-only suggestion|Unclaimed/);
  });

  it('labels the exact settled and target values without inventing pledged money or people', () => {
    const markup = render();
    const grinder = text(itemMarkup(markup, 'Coffee grinder'));
    expect(grinder).toContain('Settled R700.00');
    expect(grinder).toContain('Pool target R4 200.00');
    expect(grinder).toContain('Pool status: Open');
    expect(text(markup)).not.toMatch(/promised|pledged|remaining|saved|savings|\b713\b|\b829\b|contributors|members|Thabo|Lerato|Sibusiso/i);
    expect(markup).not.toContain('<progress');
  });

  it('retains tombstoned ledger money and gives a pivot notice without deciding an action', () => {
    const pan = text(itemMarkup(render(), 'Copper pan'));
    expect(pan).toContain('Item status: Tombstoned');
    expect(pan).toContain('Reason: Bought self');
    expect(pan).toContain('Removed from the owner’s list. Claims and pool records remain here.');
    expect(pan).toContain('Pivot needed');
    expect(pan).toContain('Choose the next step together on the item page.');
    expect(pan).toContain('Settled R350.00');
    expect(pan).toContain('Pool target R2 400.00');
    expect(pan).toContain('Price not provided');
    expect(pan).not.toContain('You are the buyer');
  });

  it.each([
    ['open', 'Open'],
    ['funded', 'Funded'],
    ['purchased', 'Purchased'],
    ['pivot_needed', 'Pivot needed'],
    ['awaiting_transfer', 'Awaiting transfer'],
  ])('humanizes the actual pool status %s without relabelling settled money', (status, label) => {
    const markup = render(withPoolStatus(status));
    expect(text(markup)).toContain(`Pool status: ${label}`);
    expect(text(markup)).toContain('Settled R700.00');
    expect(text(markup)).not.toMatch(/Funded R700\.00|Promised|Pledged/);
  });

  it.each(['active', 'tombstoned', 'revealed'] as const)('shows the actual item status %s', (status) => {
    const view = { ...friendView, items: [{ ...friendView.items[0]!, status }] };
    expect(text(render(view))).toContain(`Item status: ${status[0]!.toUpperCase()}${status.slice(1)}`);
  });

  it('renders only supplied attributes with their supplied units', () => {
    const markup = render();
    expect(text(markup)).toContain('Shoe size UK 6 shoe');
    expect(text(markup)).toContain('Ring size N58 ring');
    expect(text(markup)).toContain('Colour burnt orange');
    expect(text(markup)).not.toMatch(/copper-pan curry|medium chilli|Top M|clothing/);
    const withoutAttributes = render({ ...friendView, attributes: [] });
    expect(text(withoutAttributes)).not.toMatch(/Shoe size|Ring size|Gift preferences|UK 6|N58/);
  });

  it('uses the supplied base path for item, secret suggestion and settings navigation', () => {
    const path = '/friend/custom-circle';
    const markup = render(friendView, path);
    for (const item of friendView.items) {
      const article = itemMarkup(markup, item.title);
      // The row title is the row's only link to the item; a second "View …" link would be clutter.
      expect(article.match(/href="[^"]*"/g)).toEqual([`href="${path}/items/${item.id}"`]);
      expect(article).toContain(`>${item.title}</span>`);
    }
    expect(markup).toContain(`href="${path}/draft"`);
    expect(markup).toContain('Suggest a secret gift');
    expect(markup).toContain(`href="${path}/settings"`);
    expect(markup).toContain('Your AI settings');
    // Exactly one control form on the friend ledger: the native party-date write.
    expect(markup).toMatch(/<form\b[^>]*action="\/friend\/custom-circle\/date"[^>]*method="post"/);
    expect(markup.match(/<form\b/g)).toHaveLength(1);
    expect(markup.match(/<button\b/g)).toHaveLength(1);
    expect(markup).not.toMatch(/<script\b|\bhref="#"/);
  });

  it('never reads who wrote the party date', () => {
    const view: FriendCircleView = { ...friendView };
    Object.defineProperty(view, 'eventDateSetByUserId', {
      enumerable: true,
      get() { throw new Error('Friend screen read the party-date writer'); },
    });
    expect(render(view)).toContain('<time dateTime="2026-12-05">Sat 5 Dec</time>');
  });

  it('leaves the date line and countdown out when the circle has no party date yet', () => {
    const markup = render({ ...friendView, eventDate: null, eventDateLabel: null, countdown: null });
    expect(markup).not.toMatch(/<time\b|days to go|>Today<|>Tomorrow</);
    expect(markup).toContain('Birthday: 3 Apr');
    expect(markup).toMatch(/<form\b[^>]*action="\/c\/nadia-30th\/date"[^>]*method="post"/);
    expect(markup).not.toMatch(/value="2\d{3}-\d{2}-\d{2}"/);
  });

  it('re-renders the rejected draft with the notice, keeping the form usable', () => {
    const markup = renderToStaticMarkup(createElement(FriendLedgerScreen, {
      view: friendView,
      basePath,
      notice: 'Enter a real date, in the form 2026-12-05.',
      eventDateDraft: '2026-02-30',
    }));
    expect(markup).toContain('Enter a real date, in the form 2026-12-05.');
    expect(markup).toContain('value="2026-02-30"');
    expect(markup).toContain('role="alert"');
  });

  it('offers a clear empty state while retaining secret suggestion and settings links', () => {
    const markup = render({ ...friendView, items: [], attributes: [] });
    expect(text(markup)).toContain('No gifts in this ledger yet.');
    expect(markup).toContain(`href="${basePath}/draft"`);
    expect(markup).toContain(`href="${basePath}/settings"`);
    expect(markup).not.toContain('<article');
  });

  it('escapes supplied titles and attribute values', () => {
    const markup = render({
      ...friendView,
      name: '<script>circle</script>',
      attributes: [{ kind: 'other', valueText: '<script>preference</script>', unit: null }],
      items: [{ ...friendView.items[0]!, title: '<script>gift</script>' }],
    });
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('&lt;script&gt;circle&lt;/script&gt;');
    expect(markup).toContain('&lt;script&gt;gift&lt;/script&gt;');
    expect(markup).toContain('&lt;script&gt;preference&lt;/script&gt;');
  });
});
