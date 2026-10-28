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
  canReveal: false,
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
    pledged: 'R1 200.00',
    pledgedMinor: 120000,
    myContribution: {
      amount: 'R400.00',
      amountMinor: 40000,
      status: 'promised',
      reference: 'PN-ABC123',
    },
    payout: {
      accountHolder: 'Fictional Buyer',
      bankName: 'Fictional Bank',
      accountNumber: '12345678',
      branchCode: '123456',
      accountType: 'cheque',
      referencePrefix: null,
      shareConsent: true,
    },
    tally: [],
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
  canReveal: false,
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
    pledged: 'R1 800.00',
    pledgedMinor: 180000,
    myContribution: null,
    payout: {
      accountHolder: 'Fictional Buyer',
      bankName: 'Fictional Bank',
      accountNumber: '12345678',
      branchCode: '123456',
      accountType: null,
      referencePrefix: 'GIFTA',
      shareConsent: true,
    },
    tally: [
      {
        userId: 'user-pledger-one',
        displayName: 'Pledger One',
        amount: 'R1 000.00',
        amountMinor: 100000,
        status: 'promised',
        reference: 'GIFTA-111111',
      },
      {
        userId: 'user-pledger-two',
        displayName: 'Pledger Two',
        amount: 'R800.00',
        amountMinor: 80000,
        status: 'marked_paid',
        reference: 'GIFTA-222222',
      },
    ],
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
  canReveal: false,
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
    pledged: 'R250.00',
    pledgedMinor: 25000,
    myContribution: {
      amount: 'R250.00',
      amountMinor: 25000,
      status: 'promised',
      reference: 'PN-DEF456',
    },
    payout: {
      accountHolder: 'Fictional Buyer',
      bankName: 'Fictional Bank',
      accountNumber: '12345678',
      branchCode: '123456',
      accountType: 'savings',
      referencePrefix: null,
      shareConsent: true,
    },
    tally: [],
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
  canReveal: false,
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
        expect(form).toMatch(new RegExp(`action="${basePath}/items/${item.id}(?:/photo)?"`));
        expect(form).toMatch(/<(?:button|input)\b[^>]*name="intent"[^>]*value="(?:claim|release|create_pool|contribute|mark_paid|purchase|save_payout|set_photo)"/);
        expect(form).toContain('type="submit"');
        if (item.pool && !form.includes('/photo"')) expect(form).toContain(`name="poolId" value="${item.pool.id}"`);
        // Only the buyer's per-pledger mark-paid form names another user; the
        // route answers anyone else with an indistinguishable 404.
        if (!form.includes('value="mark_paid"')) expect(form).not.toContain('name="userId"');
        expect(form).not.toContain('name="contributionId"');
        expect(form).not.toContain('name="status"');
      }
    }
  });

  it('offers the reveal only when the view says the day has passed (F14)', () => {
    const revealable = render({ ...soloItem, secret: true, canReveal: true });
    expect(formFor(revealable, 'reveal')).toContain('Reveal this suggestion');
    expect(revealable).toContain('will not notify anyone');
    expectNoIntent(render({ ...soloItem, secret: true, canReveal: false }), 'reveal');
    expectNoIntent(render({ ...soloItem, status: 'revealed' }), 'reveal');
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
    expect(html).toContain('R1 800.00</span> settled ·');
    expect(html).toContain('Settled is not the same as marked paid');
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

  it('answers a chip tap with the pledger\u2019s own pledge, reference and share link', () => {
    const html = render(contributorItem);
    expect(html).toContain('Your pledge');
    expect(html).toContain('R250.00');
    expect(html).toContain('pledged, not yet paid');
    expect(html).toContain('PN-DEF456');
    expect(html).toContain('R250.00</span> pledged of');
    expect(html).toContain(`href="${basePath}/items/gift-contributor/pay"`);
  });

  it('hides bank details from a pledger until the buyer switches sharing on', () => {
    const unshared = render({
      ...contributorItem,
      pool: { ...contributorItem.pool!, payout: { ...contributorItem.pool!.payout!, shareConsent: false } },
    });
    expect(unshared).toContain('Your pledge');
    expect(unshared).not.toContain('12345678');
    expect(unshared).not.toContain('Fictional Bank');
    expect(unshared).not.toContain('/pay"');
  });

  it('gives the buyer a payout form, a per-pledger tally and mark-paid controls', () => {
    const html = render(buyerItem);
    expect(formFor(html, 'save_payout')).toContain('Save payment details');
    expect(html).toContain('name="shareConsent"');
    expect(html).toContain('Pledger One');
    expect(html).toContain('GIFTA-111111');
    expect(html).toContain('Pledger Two');
    expect(html).toContain('Marked paid');
    expect(html).toContain('Mark Pledger One paid');
    expect(html).not.toContain('Mark Pledger Two paid');
    expect(html).toContain(`href="${basePath}/items/gift-buyer/pay"`);
  });
});
