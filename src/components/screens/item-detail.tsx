import { AmountField, Badge, Button, Cta, ItemPhoto, Meter, Money, Notice, Panel, Screen } from '@/components/ui';
import type { CircleContext, NavItem } from '@/components/ui';
import { itemStatus, poolPercent, remainingMinor } from '@/components/status';
import { formatMinor, minorToInput } from '@/lib/money';
import type { FriendItemView } from '@/server/views';

// Quick pledges in whole units of the pool's currency. Only the ones below what is left are
// offered, plus "the rest".
const PICKS_MINOR = [10000, 25000, 50000];

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
  const status = itemStatus(item);
  const left = pool === null ? 0 : remainingMinor(pool);
  const picks = pool === null ? [] : PICKS_MINOR.filter((minor) => minor < left);
  const nav: NavItem[] = [
    { href: basePath, label: 'Gifts', icon: 'ledger' },
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
      backLabel="The gift list"
      circle={circle}
      nav={nav}
    >
      {notice && <Notice kind="error">{notice}</Notice>}

      {item.status === 'tombstoned' && (
        <Notice kind="warning" title="No longer on their list">
          <p>{tombstoneCopy}</p>
          <p className="pn-small">Pledges stay recorded. Removing a gift does not refund or move money.</p>
        </Notice>
      )}

      {isPivot && (
        <Notice kind="warning" title="This pool needs a new plan">
          <p>Agree on a different gift in the group before anyone buys anything.</p>
          <p className="pn-small">Pledges stay recorded; no money moves by itself.</p>
        </Notice>
      )}

      {item.status === 'revealed' && (
        <Notice title="This gift has been revealed">
          <p>No new claims, pools or pledges can be added here.</p>
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
              <h2 id="item-details-heading" className="pn-sr-only">The gift</h2>
              {item.hasPhoto && <ItemPhoto basePath={basePath} itemId={item.id} large />}
              <div className="pn-item-meta">
                <Badge tone={status.tone}>{status.label}</Badge>
                {item.secret && <Badge tone="human">Secret idea · hidden from them</Badge>}
                {item.addedByMe && <Badge>Your idea</Badge>}
                {item.claimedByMe && <Badge>You claimed this</Badge>}
              </div>
              {item.price
                ? <p className="pn-price">{item.price}</p>
                : <p className="pn-muted">No shop price yet.</p>}
              {item.retailer && <p className="pn-muted">{item.retailer}</p>}
            </section>
          </Panel>

          {canStart && (
            <Panel>
              <section className="pn-stack" aria-labelledby="item-claim-heading">
                <h2 id="item-claim-heading">Take care of this gift</h2>
                <p className="pn-muted">Buy it yourself, or start a pool and be the one who buys it.</p>
                <div className="pn-actions">
                  <form action={itemPath} method="post">
                    <input type="hidden" name="intent" value="claim" />
                    <Button type="submit">I’ll buy it myself</Button>
                  </form>
                </div>
                <hr className="pn-divider" />
                <form action={itemPath} method="post" className="pn-stack">
                  <input type="hidden" name="intent" value="create_pool" />
                  <input type="hidden" name="currency" value={item.currency} />
                  <AmountField
                    label="Pool target"
                    name="targetAmount"
                    id="pool-target"
                    currency={item.currency}
                    required
                    hint={item.price
                      ? <>Usually the shop price, <Money>{item.price}</Money>. Starting a pool does not pay for the gift.</>
                      : 'Starting a pool does not pay for the gift.'}
                  />
                  <div className="pn-actions">
                    <Button type="submit" variant="secondary">Start a pool · I’ll buy it</Button>
                  </div>
                </form>
              </section>
            </Panel>
          )}

          {item.claimedByMe && pool === null && (
            <Panel>
              <section className="pn-stack" aria-labelledby="item-release-heading">
                <h2 id="item-release-heading">You’re buying this</h2>
                <p className="pn-muted">Changed your mind? Letting go does not undo pledges or refund money.</p>
                <form action={itemPath} method="post" className="pn-actions">
                  <input type="hidden" name="intent" value="release" />
                  <Button type="submit" variant="secondary">Let someone else take it</Button>
                </form>
              </section>
            </Panel>
          )}

          {pool && (
            <Panel tone={isPurchased ? 'done' : 'money'}>
              <section className="pn-stack" aria-labelledby="item-pool-heading">
                <h2 id="item-pool-heading">The pool</h2>
                <Meter settled={pool.settled} target={pool.target} percent={poolPercent(pool)} />
                <div className="pn-summary">
                  <p className="pn-summary-figure">{formatMinor(left, pool.currency)}</p>
                  <p>to go · <Money>{pool.settled}</Money> settled of <Money>{pool.target}</Money> · {pool.contributors} {pool.contributors === 1 ? 'contribution' : 'contributions'} recorded</p>
                </div>

                {isActive && pool.status === 'open' && (
                  <div className="pn-stack">
                    <h3>Chip in</h3>
                    {(picks.length > 0 || left > 0) && (
                      <form action={itemPath} method="post" className="pn-picks" aria-label="Quick pledge">
                        <input type="hidden" name="intent" value="contribute" />
                        <input type="hidden" name="poolId" value={pool.id} />
                        <input type="hidden" name="currency" value={pool.currency} />
                        {picks.map((minor) => (
                          <button key={minor} type="submit" name="pledgeAmount" value={minorToInput(minor)}>
                            {formatMinor(minor, pool.currency)}
                          </button>
                        ))}
                        {left > 0 && (
                          <button type="submit" name="pledgeAmount" value={minorToInput(left)}>
                            The rest · {formatMinor(left, pool.currency)}
                          </button>
                        )}
                      </form>
                    )}
                    <form action={itemPath} method="post" className="pn-stack">
                      <input type="hidden" name="intent" value="contribute" />
                      <input type="hidden" name="poolId" value={pool.id} />
                      <input type="hidden" name="currency" value={pool.currency} />
                      <AmountField
                        label="Or your own amount"
                        name="pledgeAmount"
                        id="pool-contribution"
                        currency={pool.currency}
                        required
                        hint="This records a pledge. Pay the buyer however your group does; Piñata keeps the tally."
                      />
                      <div className="pn-actions">
                        <Button type="submit">Pledge this amount</Button>
                      </div>
                    </form>
                  </div>
                )}

                <section className="pn-item pn-stack" aria-labelledby="item-payment-heading">
                  <h3 id="item-payment-heading">Your payment</h3>
                  <p className="pn-small pn-muted">Your own pledge and payment status are not shown here. Settled is not the same as marked paid.</p>
                  <p className="pn-small">{canMarkPaid
                    ? 'Mark paid only once you pledged and sent that money outside Piñata. Piñata never takes or moves money.'
                    : 'Payment updates are paused for this pool. Existing records are unchanged.'}</p>
                  {canMarkPaid && (
                    <form action={itemPath} method="post" className="pn-actions">
                      <input type="hidden" name="intent" value="mark_paid" />
                      <input type="hidden" name="poolId" value={pool.id} />
                      <Button type="submit" variant="secondary">I’ve paid my pledge</Button>
                    </form>
                  )}
                </section>

                <section className="pn-item pn-stack" aria-labelledby="item-buyer-heading">
                  <h3 id="item-buyer-heading">{pool.iAmBuyer ? 'You’re the buyer' : 'The buyer'}</h3>
                  <p className="pn-small pn-muted">{pool.iAmBuyer
                    ? 'Record the purchase once you have bought the gift.'
                    : 'Only the buyer can record the purchase.'}</p>
                  {pool.iAmBuyer && isActive && pool.status === 'open' && (
                    <p className="pn-small pn-muted">You can record it once the pool is full.</p>
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
              <Cta href={`${itemPath}/card`}>Write your message</Cta>
              <p className="pn-small pn-muted">Hand the card over yourself. Piñata never sends it or tells them.</p>
            </section>
          </Panel>
          <p className="pn-note">Keep the plans in the group. They cannot see claims, pools or this card.</p>
        </div>
      </div>
    </Screen>
  );
}
