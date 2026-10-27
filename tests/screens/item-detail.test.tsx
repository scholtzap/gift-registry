import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ItemDetailScreen } from '@/components/screens/item-detail';
import type { FriendItemView } from '@/server/views';

const basePath = '/c/fictional-birthday';

const pivotItem: FriendItemView = {
  id: 'gift-pivot',
  title: 'Fictional espresso grinder',
  retailer: 'Demo shop',
  price: 'R2 400.00',
  status: 'tombstoned',
  tombstoneReason: 'bought_self',
  secret: false,
  addedByMe: false,
  claimedByMe: true,
  pool: {
    id: 'pool-pivot',
    target: 'R2 400.00',
    settled: 'R800.00',
    targetMinor: 240000,
    settledMinor: 80000,
    currency: 'ZAR',
    status: 'pivot_needed',
    iAmBuyer: true,
    contributors: 2,
  },
};

const buyerItem: FriendItemView = {
  id: 'gift-buyer',
  title: 'Fictional weekend bag',
  retailer: 'Demo shop',
  price: 'R1 800.00',
  status: 'active',
  tombstoneReason: null,
  secret: true,
  addedByMe: true,
  claimedByMe: false,
  pool: {
    id: 'pool-buyer',
    target: 'R1 800.00',
    settled: 'R0.00',
    targetMinor: 180000,
    settledMinor: 0,
    currency: 'ZAR',
    status: 'funded',
    iAmBuyer: true,
    contributors: 3,
  },
};

const contributorItem: FriendItemView = {
  id: 'gift-contributor',
  title: 'Fictional weekend bag',
  retailer: 'Demo shop',
  price: 'R1 800.00',
  status: 'active',
  tombstoneReason: null,
  secret: true,
  addedByMe: false,
  claimedByMe: false,
  pool: {
    id: 'pool-contributor',
    target: 'R1 800.00',
    settled: 'R0.00',
    targetMinor: 180000,
    settledMinor: 0,
    currency: 'ZAR',
    status: 'open',
    iAmBuyer: false,
    contributors: 1,
  },
};

const soloItem: FriendItemView = {
  id: 'gift-solo',
  title: 'Fictional puzzle',
  retailer: null,
  price: null,
  status: 'active',
  tombstoneReason: null,
  secret: false,
  addedByMe: false,
  claimedByMe: false,
  pool: null,
};

function render(item: FriendItemView, notice?: string): string {
  return renderToStaticMarkup(<ItemDetailScreen item={item} basePath={basePath} notice={notice} />);
}

function forms(html: string): string[] {
  return Array.from(html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g), (match) => match[0]);
}

function formFor(html: string, intent: string): string {
  const form = forms(html).find((candidate) =>
    new RegExp(`<(?:button|input)\\b[^>]*name="intent"[^>]*value="${intent}"`).test(candidate),
  );
  expect(form, `POST form for ${intent}`).toBeDefined();
  return form!;
}

function expectNoIntent(html: string, intent: string): void {
  expect(html).not.toContain(`value="${intent}"`);
}

function integerInput(form: string, name: string): string {
  const input = Array.from(form.matchAll(/<input\b[^>]*>/g), (match) => match[0])
    .find((tag) => tag.includes(`name="${name}"`));
  expect(input, `integer input for ${name}`).toBeDefined();
  for (const attribute of ['type="number"', 'min="1"', 'step="1"', 'required=""']) {
    expect(input).toContain(attribute);
  }
  expect(input).not.toMatch(/\bvalue="/);
  return input!;
}

describe('ItemDetailScreen public friend render', () => {
  it('renders the literal tombstone/pivot fixture and preserves its ledger', () => {
    const html = render(pivotItem);
    expect(html).toContain('Fictional espresso grinder');
    expect(html).toContain('No longer on the list');
    expect(html).toContain('They bought this themselves.');
    expect(html).toContain('Choose a different gift');
    expect(html).toContain('Existing contributions stay recorded');
    expect(html).toContain('R800.00');
    expect(html).toContain('R2 400.00');
    expect(html).toContain('pn-banner');
    expectNoIntent(html, 'claim');
    expectNoIntent(html, 'create_pool');
    expectNoIntent(html, 'contribute');
    expectNoIntent(html, 'purchase');
    expectNoIntent(html, 'release');
    expectNoIntent(html, 'mark_paid');
    expect(forms(html)).toHaveLength(0);
    expect(html).toContain(`href="${basePath}/items/gift-pivot/card"`);
  });

  it('renders buyer-only purchase controls from the literal funded fixture', () => {
    const html = render(buyerItem);
    expect(html).toContain('You are the buyer');
    expect(formFor(html, 'purchase')).toContain('I bought this gift');
    expectNoIntent(html, 'contribute');
    expect(formFor(html, 'mark_paid')).toContain('Mark my contribution as paid');
    expect(html).toContain('Hidden from the recipient');
    expect(html).toContain('You suggested this');
    expect(html).toContain(`href="${basePath}/items/gift-buyer/card"`);
  });

  it('never offers purchase to a friend who is not the buyer', () => {
    const html = render({ ...buyerItem, pool: { ...buyerItem.pool!, iAmBuyer: false } });
    expectNoIntent(html, 'purchase');
    expect(html).toContain('Only the assigned buyer can record the purchase.');
  });

  it('offers claim and a required integer ZAR pool target without inventing availability', () => {
    const html = render(soloItem);
    expect(formFor(html, 'claim')).toContain('Claim this gift');
    const poolForm = formFor(html, 'create_pool');
    integerInput(poolForm, 'targetMinor');
    expect(poolForm).toContain('name="currency" value="ZAR"');
    expect(html).toContain('Pool target in cents');
    expect(html).toContain('10000 means R100.00');
    expect(html).toContain('Only available gifts can be claimed or pooled.');
    expect(html).not.toContain('Unclaimed');
    expect(html).not.toContain('R0.00');
  });

  it('requires positive whole-number contribution amounts with an associated label and hint', () => {
    const html = render(contributorItem);
    const form = formFor(html, 'contribute');
    const input = integerInput(form, 'amountMinor');
    expect(form).toContain('name="currency" value="ZAR"');
    expect(form).toContain('Your contribution in cents');
    const id = input.match(/\bid="([^"]+)"/)?.[1];
    const hintId = input.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeDefined();
    expect(hintId).toBeDefined();
    expect(form).toContain(`<label for="${id}"`);
    expect(form).toContain(`id="${hintId}"`);
  });

  it('sends every mutation to the item endpoint with an explicit intent', () => {
    for (const item of [soloItem, { ...soloItem, claimedByMe: true }, buyerItem, contributorItem]) {
      const html = render(item);
      expect(forms(html).length).toBeGreaterThan(0);
      for (const form of forms(html)) {
        expect(form).toContain('method="post"');
        expect(form).toContain(`action="${basePath}/items/${item.id}"`);
        expect(form).toMatch(/<(?:button|input)\b[^>]*name="intent"[^>]*value="(?:claim|release|create_pool|contribute|mark_paid|purchase)"/);
        expect(form).toContain('type="submit"');
        if (item.pool) expect(form).toContain(`name="poolId" value="${item.pool.id}"`);
        expect(form).not.toContain('name="userId"');
        expect(form).not.toContain('name="contributionId"');
        expect(form).not.toContain('name="status"');
      }
    }
  });

  it('offers release, not a new claim or pool, for my existing solo claim', () => {
    const html = render({ ...soloItem, claimedByMe: true });
    expect(formFor(html, 'release')).toContain('Release my claim');
    expectNoIntent(html, 'claim');
    expectNoIntent(html, 'create_pool');
  });

  it('does not offer solo release for my pool-member claim', () => {
    const html = render({ ...buyerItem, claimedByMe: true });
    expectNoIntent(html, 'release');
    expect(html).toContain('You claimed this');
  });

  it('keeps solo release available on an inactive gift without erasing its history', () => {
    const html = render({ ...soloItem, status: 'tombstoned', claimedByMe: true });
    expect(formFor(html, 'release')).toContain('Release my claim');
    expectNoIntent(html, 'claim');
    expectNoIntent(html, 'create_pool');
  });

  it('shows an explicitly purchased pool without offering new money or purchase mutations', () => {
    const html = render({ ...buyerItem, pool: { ...buyerItem.pool!, status: 'purchased' } });
    expect(html).toContain('Gift purchased');
    expectNoIntent(html, 'claim');
    expectNoIntent(html, 'create_pool');
    expectNoIntent(html, 'contribute');
    expectNoIntent(html, 'mark_paid');
    expectNoIntent(html, 'purchase');
    expect(html).toContain(`href="${basePath}/items/gift-buyer/card"`);
  });

  it.each(['tombstoned', 'revealed'] as const)('blocks new commitments on %s items without a pool', (status) => {
    const html = render({ ...soloItem, status, tombstoneReason: status === 'tombstoned' ? 'no_longer_wants' : null });
    expectNoIntent(html, 'claim');
    expectNoIntent(html, 'create_pool');
    expectNoIntent(html, 'contribute');
    expect(html).toContain(status === 'tombstoned' ? 'They no longer want this gift.' : 'This gift has been revealed');
  });

  it('blocks new contributions on a pivot even when the item is still active', () => {
    const html = render({ ...pivotItem, status: 'active', tombstoneReason: null });
    expect(html).toContain('Choose a different gift');
    expectNoIntent(html, 'claim');
    expectNoIntent(html, 'create_pool');
    expectNoIntent(html, 'contribute');
    expectNoIntent(html, 'purchase');
    expectNoIntent(html, 'mark_paid');
    expect(html).toContain('Payment updates are paused for this pool. Existing records are unchanged.');
  });

  it.each(['tombstoned', 'revealed'] as const)('pauses money mutations on a %s gift even with a funded pool', (status) => {
    const html = render({ ...buyerItem, status });
    expectNoIntent(html, 'contribute');
    expectNoIntent(html, 'mark_paid');
    expectNoIntent(html, 'purchase');
    expect(html).toContain('R1 800.00');
  });

  it('does not infer my payment or purchase from formatted settled money', () => {
    const html = render({ ...buyerItem, pool: { ...buyerItem.pool!, status: 'open', settled: 'R1 800.00' } });
    expect(html).toContain('Settled total');
    expect(html).toContain('Your contribution amount and payment status are not shown here.');
    expect(html).toContain('Mark paid only if you already pledged and sent that money outside Piñata.');
    expect(html).toContain('Settled is not the same as marked paid');
    expect(html).not.toContain('You have paid');
    expect(html).not.toContain('Gift purchased');
    expect(html).not.toContain('name="paid"');
    expect(html).not.toContain('<progress');
    expectNoIntent(html, 'purchase');
    expect(html).toContain('Purchase can be recorded when the pool is funded.');
  });

  it('escapes item and notice text and announces only a supplied notice', () => {
    const html = render({ ...soloItem, title: '<script>gift</script>' }, '<script>notice</script>');
    expect(html).toContain('&lt;script&gt;gift&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;notice&lt;/script&gt;');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('<script>');
    expect(render(soloItem)).not.toContain('role="alert"');
  });
});
