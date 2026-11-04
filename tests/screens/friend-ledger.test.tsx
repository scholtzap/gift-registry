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
      currency: 'ZAR',
      hasPhoto: false,
      status: 'active',
      tombstoneReason: null,
      secret: false,
      addedByMe: false,
      claimedByMe: false,
      claimedByName: null,
      canReveal: false,
      pool: null,
    },
    {
      id: 'secret-grinder',
      title: 'Coffee grinder',
      retailer: 'Coffee shop',
      price: 'R4 200.00',
      currency: 'ZAR',
      hasPhoto: false,
      status: 'active',
      tombstoneReason: null,
      secret: true,
      addedByMe: true,
      claimedByMe: true,
      claimedByName: null,
      canReveal: false,
      pool: {
        id: 'grinder-pool',
        target: 'R4 200.00',
        settled: 'R700.00',
        targetMinor: 420000,
        settledMinor: 70000,
        currency: 'ZAR',
        status: 'open',
        buyerName: 'Thabo',
        iAmBuyer: true,
        contributors: 713,
        pledged: 'R1 000.00',
        pledgedMinor: 100000,
        myContribution: null,
        payout: null,
        tally: [],
      },
    },
    {
      id: 'tombstoned-pan',
      title: 'Copper pan',
      retailer: null,
      price: null,
      currency: 'ZAR',
      hasPhoto: false,
      status: 'tombstoned',
      tombstoneReason: 'bought_self',
      secret: false,
      addedByMe: false,
      claimedByMe: true,
      claimedByName: null,
      canReveal: false,
      pool: {
        id: 'pan-pool',
        target: 'R2 400.00',
        settled: 'R350.00',
        targetMinor: 240000,
        settledMinor: 35000,
        currency: 'ZAR',
        status: 'pivot_needed',
        buyerName: 'Lerato',
        iAmBuyer: false,
        contributors: 829,
        pledged: 'R350.00',
        pledgedMinor: 35000,
        myContribution: null,
        payout: null,
        tally: [],
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
    expect(text(markup)).toContain('Keep this screen away from them.');
    expect(text(markup)).toContain('birthday');
    expect(markup).toMatch(/<time dateTime="2026-12-05">Sat 5 Dec<\/time>/i); expect(text(markup).match(/Sat 5 Dec/g)).toHaveLength(1); expect(text(markup).match(/12 days to go/g)).toHaveLength(1);
    expect(text(markup)).toContain('Birthday: 3 Apr');
    expect(text(itemMarkup(markup, 'Trail runners, burnt orange'))).toContain('R1 899.00');
    expect(text(grinder)).toContain('Coffee shop');
    expect(text(grinder)).toContain('R4 200.00');
    expect(text(grinder)).toContain('Secret idea · hidden from them');
    expect(text(grinder)).toContain('Your idea');
    expect(text(grinder)).toContain('You’re the buyer');
    const runners = text(itemMarkup(markup, 'Trail runners, burnt orange'));
    expect(runners).toContain('No pool yet');
    // Unclaimed and no pool: do not invent availability wording.
    expect(runners).not.toMatch(/You’re buying it|You’re the buyer|Your idea|Secret idea|Up for grabs|Unclaimed/);
    expect(text(itemMarkup(markup, 'Copper pan'))).toContain('Lerato is the buyer');
  });

  it('names the solo claimer when someone else is buying it', () => {
    const view = {
      ...friendView,
      items: [{ ...friendView.items[0]!, claimedByName: 'Sibusiso' }],
    };
    expect(text(itemMarkup(render(view), 'Trail runners, burnt orange'))).toContain('Sibusiso is buying it');
  });

  it('labels the exact settled and target values without inventing pledged money or people', () => {
    const markup = render();
    const grinder = text(itemMarkup(markup, 'Coffee grinder'));
    expect(grinder).toContain('R700.00 settled of R4 200.00');
    expect(grinder).toContain('Pooling · R3 500 to go');
    expect(text(markup)).not.toMatch(/promised|pledged|remaining|saved|savings|\b713\b|\b829\b|contributors|members/i);
    expect(markup).not.toContain('<progress');
  });

  it('retains tombstoned ledger money and gives a pivot notice without deciding an action', () => {
    const pan = text(itemMarkup(render(), 'Copper pan'));
    expect(pan).toContain('They bought it themselves');
    expect(pan).toContain('Gone from their list. Contributions and pool records stay here with the group.');
    expect(pan).toContain('Pick the next step together on the gift page.');
    expect(pan).toContain('R350.00 settled of R2 400.00');
    expect(pan).toContain('No price yet');
    expect(pan).not.toContain('You’re the buyer');
  });

  it.each([
    ['open', 'Pooling · R3 500 to go'],
    ['funded', 'Fully pooled'],
    ['purchased', 'Bought'],
    ['pivot_needed', 'Needs a new plan'],
    ['awaiting_transfer', 'Pool paused'],
  ])('words the actual pool status %s plainly without relabelling settled money', (status, label) => {
    const markup = render(withPoolStatus(status));
    expect(text(markup)).toContain(label);
    expect(text(markup)).toContain('R700.00 settled of R4 200.00');
    expect(text(markup)).not.toMatch(/Funded R700\.00|Promised|Pledged/);
  });

  it.each([
    ['active', 'No pool yet'],
    ['tombstoned', 'Off their list'],
    ['revealed', 'Revealed'],
  ] as const)('words the actual item status %s plainly', (status, label) => {
    const view = { ...friendView, items: [{ ...friendView.items[0]!, status }] };
    expect(text(render(view))).toContain(label);
  });

  it('never lets an amount wrap: digit groups are joined by a no-break space', () => {
    const grinder = itemMarkup(render(), 'Coffee grinder');
    expect(grinder).toContain('R3 500 to go');
    expect(grinder).toMatch(/<span class="pn-money">R700\.00<\/span>/);
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
    expect(text(markup)).toContain('Nothing on the list yet');
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
