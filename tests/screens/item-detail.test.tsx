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
  currency: 'ZAR',
  hasPhoto: false,
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
  currency: 'ZAR',
  hasPhoto: false,
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
  currency: 'ZAR',
  hasPhoto: false,
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
  currency: 'ZAR',
  hasPhoto: false,
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

// Amounts are typed in rand; the server parses them to integer cents.
function randInput(form: string, name: string): string {
  const input = Array.from(form.matchAll(/<input\b[^>]*>/g), (match) => match[0])
    .find((tag) => tag.includes(`name="${name}"`));
  expect(input, `rand input for ${name}`).toBeDefined();
  for (const attribute of ['type="text"', 'inputMode="decimal"', 'required=""']) {
    expect(input).toContain(attribute);
  }
  expect(input).not.toMatch(/\bvalue="/);
  return input!;
}

describe('ItemDetailScreen public friend render', () => {
  it('renders the literal tombstone/pivot fixture and preserves its ledger', () => {
    const html = render(pivotItem);
    expect(html).toContain('Fictional espresso grinder');
    expect(html).toContain('No longer on their list');
    expect(html).toContain('They bought this themselves.');
    expect(html).toContain('This pool needs a new plan');
    expect(html).toContain('Pledges stay recorded');
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
    expect(html).toContain('You’re the buyer');
    expect(formFor(html, 'purchase')).toContain('I bought this gift');
    expectNoIntent(html, 'contribute');
    expect(formFor(html, 'mark_paid')).toContain('I’ve paid my pledge');
    expect(html).toContain('Secret idea · hidden from them');
    expect(html).toContain('Your idea');
    expect(html).toContain(`href="${basePath}/items/gift-buyer/card"`);
  });

  it('never offers purchase to a friend who is not the buyer', () => {
    const html = render({ ...buyerItem, pool: { ...buyerItem.pool!, iAmBuyer: false } });
    expectNoIntent(html, 'purchase');
    expect(html).toContain('Only the buyer can record the purchase.');
  });

  it('offers claim and a required rand pool target without inventing availability', () => {
    const html = render(soloItem);
    expect(formFor(html, 'claim')).toContain('I’ll buy it myself');
    const poolForm = formFor(html, 'create_pool');
    randInput(poolForm, 'targetAmount');
    expect(poolForm).toContain('name="currency" value="ZAR"');
    expect(html).toContain('Pool target');
    expect(html).not.toMatch(/cents/i);
    expect(html).not.toContain('Unclaimed');
    expect(html).not.toContain('Up for grabs');
    expect(html).not.toContain('R0.00');
  });

  it('requires a rand contribution amount with an associated label and hint', () => {
    const html = render(contributorItem);
    const form = forms(html).find((candidate) => candidate.includes('class="pn-input"') && candidate.includes('value="contribute"'));
    expect(form, 'typed contribution form').toBeDefined();
    const input = randInput(form!, 'pledgeAmount');
    expect(form).toContain('name="currency" value="ZAR"');
    expect(form).toContain('Or your own amount');
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
    expect(formFor(html, 'release')).toContain('Let someone else take it');
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
    expect(formFor(html, 'release')).toContain('Let someone else take it');
    expectNoIntent(html, 'claim');
    expectNoIntent(html, 'create_pool');
  });

  it('shows an explicitly purchased pool without offering new money or purchase mutations', () => {
    const html = render({ ...buyerItem, pool: { ...buyerItem.pool!, status: 'purchased' } });
    expect(html).toContain('Bought');
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
    expect(html).toContain('This pool needs a new plan');
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
    expect(html).toContain('R1 800.00</span> settled of');
    expect(html).toContain('Your own pledge and payment status are not shown here.');
    expect(html).toContain('Mark paid only once you pledged and sent that money outside Piñata.');
    expect(html).toContain('Settled is not the same as marked paid');
    expect(html).not.toContain('You have paid');
    expect(html).not.toMatch(/>✓ <\/span>Bought</);
    expect(html).not.toContain('name="paid"');
    expect(html).not.toContain('<progress');
    expectNoIntent(html, 'purchase');
    expect(html).toContain('You can record it once the pool is full.');
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
