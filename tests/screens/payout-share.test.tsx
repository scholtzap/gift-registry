import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PayoutShareScreen } from '@/components/screens/payout-share';

const basePool = {
  id: 'pool-pay',
  target: 'R1 000.00',
  settled: 'R0.00',
  targetMinor: 100000,
  settledMinor: 0,
  currency: 'ZAR',
  status: 'open',
  iAmBuyer: false,
  contributors: 2,
  pledged: 'R350.00',
  pledgedMinor: 35000,
};

describe('PayoutShareScreen', () => {
  it('renders bank details, the full tally and a WhatsApp share link for the buyer', () => {
    const html = renderToStaticMarkup(
      <PayoutShareScreen
        itemTitle="Fictional picnic blanket"
        pool={{
          ...basePool,
          myContribution: null,
          payout: {
            accountHolder: 'Fictional Buyer',
            bankName: 'Fictional Bank',
            accountNumber: '12345678',
            branchCode: '123456',
            accountType: 'cheque',
            referencePrefix: 'GIFT',
            shareConsent: true,
          },
          tally: [
            { userId: 'u1', displayName: 'Pledger One', amount: 'R250.00', amountMinor: 25000, status: 'promised' as const, reference: 'GIFT-AAAAAA' },
            { userId: 'u2', displayName: 'Pledger Two', amount: 'R100.00', amountMinor: 10000, status: 'marked_paid' as const, reference: 'GIFT-BBBBBB' },
          ],
        }}
        backHref="/c/x/items/i"
        shareText="pay text"
        shareHref="https://wa.me/?text=pay%20text"
      />,
    );
    expect(html).toContain('Fictional Buyer');
    expect(html).toContain('12345678');
    expect(html).toContain('Pledger One');
    expect(html).toContain('GIFT-AAAAAA');
    expect(html).toContain('https://wa.me/?text=pay%20text');
    expect(html).toContain('<textarea');
    expect(html).toContain('pay text');
  });

  it('shows a pledger only their own line, never another pledge', () => {
    const html = renderToStaticMarkup(
      <PayoutShareScreen
        itemTitle="Fictional picnic blanket"
        pool={{
          ...basePool,
          myContribution: { amount: 'R250.00', amountMinor: 25000, status: 'promised' as const, reference: 'PN-CCCCCC' },
          payout: {
            accountHolder: 'Fictional Buyer',
            bankName: 'Fictional Bank',
            accountNumber: '12345678',
            branchCode: '123456',
            accountType: null,
            referencePrefix: null,
            shareConsent: true,
          },
          tally: [],
        }}
        backHref="/c/x/items/i"
        shareText="own line"
        shareHref="https://wa.me/?text=own%20line"
      />,
    );
    expect(html).toContain('PN-CCCCCC');
    expect(html).not.toContain('Pledger');
  });
});
