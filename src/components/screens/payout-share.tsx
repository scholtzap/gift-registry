import { Cta, Panel, Screen } from '@/components/ui';
import type { CircleContext } from '@/components/ui';
import type { FriendItemView } from '@/server/views';

type Pool = NonNullable<FriendItemView['pool']>;

/**
 * Friend projection only: bank details the buyer switched on, plus the
 * per-pledger amounts and references the viewer may see. One copyable block
 * and one WhatsApp share link — the send itself stays the human's tap, so
 * Piñata never notifies anyone (same rule as the gift card).
 */
export function PayoutShareScreen({
  itemTitle,
  pool,
  backHref,
  circle,
  shareText,
  shareHref,
}: {
  itemTitle: string;
  pool: Pool;
  backHref: string;
  circle?: CircleContext;
  shareText: string;
  shareHref: string;
}) {
  const payout = pool.payout!;
  const lines = pool.tally.length > 0
    ? pool.tally
    : (pool.myContribution ? [{ displayName: 'You', amount: pool.myContribution.amount, status: pool.myContribution.status, reference: pool.myContribution.reference }] : []);
  return (
    <Screen
      title={`Pay for ${itemTitle}`}
      backHref={backHref}
      backLabel="Back to the gift"
      circle={circle}
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        <Panel tone="money" className="pn-stack">
          <h2>Where the money goes</h2>
          <p className="pn-muted">Pay by hand, outside Piñata, then mark your pledge paid on the gift page.</p>
          <p><strong>{payout.accountHolder}</strong></p>
          <p>{payout.bankName}</p>
          <p>Account: {payout.accountNumber}</p>
          <p>Branch code: {payout.branchCode}</p>
          {payout.accountType && <p>Account type: {payout.accountType}</p>}
        </Panel>

        <Panel className="pn-stack">
          <section className="pn-stack" aria-labelledby="pay-share-heading">
            <h2 id="pay-share-heading">Who owes what</h2>
            <ul className="pn-list">
              {lines.map((row) => (
                <li key={row.reference} className="pn-item pn-stack pn-stack-sm">
                  <p><strong>{row.displayName}</strong> · {row.amount} · ref {row.reference}</p>
                  <p className="pn-small pn-muted">{row.status === 'promised' ? 'Not yet paid' : 'Marked paid'}</p>
                </li>
              ))}
            </ul>
          </section>
        </Panel>

        <Panel className="pn-stack">
          <section className="pn-stack" aria-labelledby="pay-copy-heading">
            <h2 id="pay-copy-heading">Share it with the group</h2>
            <p className="pn-muted">Copy the text below into your WhatsApp group, or open it in WhatsApp with one tap. Piñata sends nothing itself.</p>
            <div className="pn-actions">
              <Cta href={shareHref} variant="primary">Share in WhatsApp</Cta>
            </div>
            <label className="pn-small pn-muted" htmlFor="pay-share-text">Copyable payment text</label>
            <textarea id="pay-share-text" className="pn-input" rows={shareText.split('\n').length + 1} readOnly defaultValue={shareText} />
          </section>
        </Panel>
      </div>
    </Screen>
  );
}
