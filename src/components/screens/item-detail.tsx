import { Badge, Button, Cta, Field, Meter, Notice, Panel, Screen, Stat, StatList } from '@/components/ui';
import type { CircleContext, NavItem } from '@/components/ui';
import type { FriendItemView } from '@/server/views';

function percent(pool: NonNullable<FriendItemView['pool']>) {
  return pool.targetMinor > 0 ? Math.round((pool.settledMinor / pool.targetMinor) * 100) : 0;
}

/** Friend projection only; the parent route must exclude the owner. */
export function ItemDetailScreen({
  item,
  basePath,
  notice,
  circle,
}: {
  item: FriendItemView;
  basePath: string;
  notice?: string;
  circle?: CircleContext;
}) {
  const itemPath = `${basePath}/items/${item.id}`;
  const pool = item.pool;
  const isPivot = pool?.status === 'pivot_needed';
  const isActive = item.status === 'active' && !isPivot;
  const canStart = isActive && pool === null && !item.claimedByMe;
  const canMarkPaid = isActive && pool !== null && (pool.status === 'open' || pool.status === 'funded');
  const isPurchased = pool?.status === 'purchased';
  const nav: NavItem[] = [
    { href: basePath, label: 'Ledger', icon: 'ledger' },
    { href: `${basePath}/draft`, label: 'Suggest', icon: 'add' },
    { href: `${basePath}/settings`, label: 'Settings', icon: 'settings' },
  ];
  const tombstoneCopy = item.tombstoneReason === 'bought_self'
    ? 'They bought this themselves.'
    : item.tombstoneReason === 'no_longer_wants'
      ? 'They no longer want this gift.'
      : item.tombstoneReason === 'duplicate'
        ? 'This was a duplicate gift.'
        : 'This gift was removed from their list.';

  return (
    <Screen
      title={item.title}
      backHref={basePath}
      backLabel="Back to the circle"
      circle={circle}
      nav={nav}
    >
      {notice && <Notice kind="error">{notice}</Notice>}

      {item.status === 'tombstoned' && (
        <Notice title="No longer on the list">
          <p>{tombstoneCopy}</p>
          <p className="pn-small">Existing contributions stay recorded. Removing a gift does not refund or move money.</p>
        </Notice>
      )}

      {isPivot && (
        <Notice title="Choose a different gift">
          <p>This pool needs a new plan. Talk to the group before buying anything else.</p>
          <p className="pn-small">Existing contributions stay recorded; no money moves automatically.</p>
        </Notice>
      )}

      {item.status === 'revealed' && (
        <Notice title="This gift has been revealed">
          <p>No new claims, pools or contributions can be added here.</p>
        </Notice>
      )}

      {item.canReveal && (
        <Panel>
          <section className="pn-stack" aria-labelledby="item-reveal-heading">
            <h2 id="item-reveal-heading">The day has passed</h2>
            <p className="pn-muted">You can show this suggestion to them now. Piñata will not notify anyone — revealing stays your act.</p>
            <form action={itemPath} method="post" className="pn-actions">
              <input type="hidden" name="intent" value="reveal" />
              <Button type="submit" variant="secondary">Reveal this suggestion</Button>
            </form>
          </section>
        </Panel>
      )}

      <div className="pn-cols">
        <div className="pn-stack">
          <Panel>
            <section className="pn-stack" aria-labelledby="item-details-heading">
              <h2 id="item-details-heading">The gift</h2>
              {(item.secret || item.addedByMe || item.claimedByMe) && (
                <div className="pn-item-meta">
                  {item.secret && <Badge tone="pink">Hidden from the recipient</Badge>}
                  {item.addedByMe && <Badge>You suggested this</Badge>}
                  {item.claimedByMe && <Badge>You claimed this</Badge>}
                </div>
              )}
              {item.retailer && <p className="pn-muted">{item.retailer}</p>}
              {item.price
                ? <p className="pn-price">{item.price}</p>
                : <p className="pn-muted">No shop price recorded.</p>}
            </section>
          </Panel>

          {canStart && (
            <Panel>
              <section className="pn-stack" aria-labelledby="item-claim-heading">
                <h2 id="item-claim-heading">Take care of this gift</h2>
                <p className="pn-muted">Claim it to buy it yourself, or start a pool and become the assigned buyer.</p>
                <p className="pn-small">Only available gifts can be claimed or pooled.</p>
                <div className="pn-actions">
                  <form action={itemPath} method="post">
                    <input type="hidden" name="intent" value="claim" />
                    <Button type="submit">Claim this gift</Button>
                  </form>
                </div>
                <form action={itemPath} method="post" className="pn-stack">
                  <input type="hidden" name="intent" value="create_pool" />
                  <input type="hidden" name="currency" value="ZAR" />
                  <Field
                    label="Pool target in cents"
                    name="targetMinor"
                    id="pool-target"
                    type="number"
                    min="1"
                    step="1"
                    required
                    hint="A whole number of cents: 10000 means R100.00. Starting a pool does not pay for the gift."
                  />
                  <div className="pn-actions">
                    <Button type="submit" variant="secondary">Start a pool as buyer</Button>
                  </div>
                </form>
              </section>
            </Panel>
          )}

          {item.claimedByMe && pool === null && (
            <Panel>
              <section className="pn-stack" aria-labelledby="item-release-heading">
                <h2 id="item-release-heading">Your claim</h2>
                <p className="pn-muted">Releasing your claim does not undo contributions or refund money.</p>
                <form action={itemPath} method="post" className="pn-actions">
                  <input type="hidden" name="intent" value="release" />
                  <Button type="submit" variant="secondary">Release my claim</Button>
                </form>
              </section>
            </Panel>
          )}

          {pool && (
            <Panel tone={isPurchased ? 'done' : 'money'}>
              <section className="pn-stack" aria-labelledby="item-pool-heading">
                <div className="pn-between">
                  <h2 id="item-pool-heading">Group pool</h2>
                  <Badge tone={isPurchased ? 'green' : isPivot ? 'warning' : 'blue'}>{isPurchased
                    ? 'Gift purchased'
                    : pool.status === 'open'
                      ? 'Open'
                      : pool.status === 'funded'
                        ? 'Funded'
                        : isPivot ? 'Needs a new plan' : 'Pool updates paused'}</Badge>
                </div>
                <Meter settled={pool.settled} target={pool.target} percent={percent(pool)} />
                <StatList>
                  <Stat label="Pool target" value={pool.target} />
                  <Stat label="Settled total" value={pool.settled} />
                  <Stat label="Contributions recorded" value={pool.contributors} />
                </StatList>
                <p className="pn-small pn-muted">Settled is not the same as marked paid, and neither total tells you your own payment status.</p>

                {isActive && pool.status === 'open' && (
                  <form action={itemPath} method="post" className="pn-stack">
                    <input type="hidden" name="intent" value="contribute" />
                    <input type="hidden" name="poolId" value={pool.id} />
                    <input type="hidden" name="currency" value="ZAR" />
                    <Field
                      label="Your contribution in cents"
                      name="amountMinor"
                      id="pool-contribution"
                      type="number"
                      min="1"
                      step="1"
                      required
                      hint="A whole number of cents: 10000 means R100.00. This records a pledge, not a payment."
                    />
                    <div className="pn-actions">
                      <Button type="submit">Record my contribution</Button>
                    </div>
                  </form>
                )}

                <section className="pn-item pn-stack" aria-labelledby="item-payment-heading">
                  <h3 id="item-payment-heading">Your payment</h3>
                  <p className="pn-note">Your contribution amount and payment status are not shown here.</p>
                  <p className="pn-small">{canMarkPaid
                    ? 'Mark paid only if you already pledged and sent that money outside Piñata. Piñata does not take or transfer payments. Your existing contribution is checked before this records.'
                    : 'Payment updates are paused for this pool. Existing records are unchanged.'}</p>
                  {canMarkPaid && (
                    <form action={itemPath} method="post" className="pn-actions">
                      <input type="hidden" name="intent" value="mark_paid" />
                      <input type="hidden" name="poolId" value={pool.id} />
                      <Button type="submit" variant="secondary">Mark my contribution as paid</Button>
                    </form>
                  )}
                </section>

                <section className="pn-item pn-stack" aria-labelledby="item-buyer-heading">
                  <h3 id="item-buyer-heading">{pool.iAmBuyer ? 'You are the buyer' : 'The assigned buyer'}</h3>
                  <p className="pn-muted">{pool.iAmBuyer
                    ? 'Record the purchase only after you have bought the gift. The pool is checked before this records.'
                    : 'Only the assigned buyer can record the purchase.'}</p>
                  {pool.iAmBuyer && isActive && pool.status === 'open' && (
                    <p className="pn-small pn-muted">Purchase can be recorded when the pool is funded.</p>
                  )}
                  {pool.iAmBuyer && isActive && pool.status === 'funded' && (
                    <form action={itemPath} method="post" className="pn-actions">
                      <input type="hidden" name="intent" value="purchase" />
                      <input type="hidden" name="poolId" value={pool.id} />
                      <Button type="submit">I bought this gift</Button>
                    </form>
                  )}
                </section>
              </section>
            </Panel>
          )}
        </div>

        {/* Rail last in the DOM so mobile reads the gift and its money first; CSS puts it on the
            right at desktop, and the card stays the human moment there. */}
        <div className="pn-rail">
          <Panel tone="human">
            <section className="pn-stack" aria-labelledby="item-card-heading">
              <h2 id="item-card-heading">A card from the group</h2>
              <Cta href={`${itemPath}/card`}>Write your gift card message</Cta>
              <p className="pn-small pn-muted">Hand the card over yourself when you are ready. Piñata never sends it or notifies the recipient.</p>
            </section>
          </Panel>
          <p className="pn-note">Keep the plans in the group. The recipient cannot see claims, pools or this card here.</p>
        </div>
      </div>
    </Screen>
  );
}
