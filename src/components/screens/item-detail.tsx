import { AmountField, Badge, Button, Cta, Field, IdemKey, ItemPhoto, Meter, Money, Notice, PhotoUploadForm, Panel, Screen } from '@/components/ui';
import type { CircleContext, NavItem } from '@/components/ui';
import { contributionStatusLabel, itemStatus, ownPledgeStatusLabel, poolPercent, remainingMinor, tombstoneCopy } from '@/components/status';
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
  const canEditPayout = pool !== null && pool.iAmBuyer && canMarkPaid;
  const canRecordPurchase = pool !== null && pool.iAmBuyer && isActive && pool.status === 'funded';
  const payoutShared = pool !== null && pool.payout !== null && (pool.iAmBuyer || pool.payout.shareConsent);
  const nav: NavItem[] = [
    { href: basePath, label: 'Gifts', icon: 'ledger' },
    { href: `${basePath}/draft`, label: 'Suggest', icon: 'add' },
    { href: `${basePath}/settings`, label: 'Settings', icon: 'settings' },
  ];

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
          <p>{tombstoneCopy(item.tombstoneReason)}</p>
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
              <IdemKey />
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
              {item.addedByMe && <PhotoUploadForm basePath={basePath} itemId={item.id} hasPhoto={item.hasPhoto} />}
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
                    <IdemKey />
                    <Button type="submit">I’ll buy it myself</Button>
                  </form>
                </div>
                <hr className="pn-divider" />
                <form action={itemPath} method="post" className="pn-stack">
                  <input type="hidden" name="intent" value="create_pool" />
                  <IdemKey />
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
                  <IdemKey />
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
                  <p>to go · <Money>{pool.pledged}</Money> pledged of <Money>{pool.target}</Money> · <Money>{pool.settled}</Money> settled · {pool.contributors} {pool.contributors === 1 ? 'contribution' : 'contributions'} recorded</p>
                </div>

                {pool.myContribution !== null && (
                  <section className="pn-item pn-stack pn-stack-sm" aria-labelledby="item-own-pledge-heading">
                    <h3 id="item-own-pledge-heading">Your pledge</h3>
                    <p><Money>{pool.myContribution.amount}</Money> · {ownPledgeStatusLabel(pool.myContribution.status)}</p>
                    <p className="pn-small pn-muted">Use this reference when you pay: {pool.myContribution.reference}</p>
                    {payoutShared && (
                      <Cta href={`${itemPath}/pay`}>Payment details and share</Cta>
                    )}
                  </section>
                )}

                {isActive && pool.status === 'open' && (
                  <div className="pn-stack">
                    <h3>Chip in</h3>
                    {(picks.length > 0 || left > 0) && (
                      <form action={itemPath} method="post" className="pn-picks" aria-label="Quick pledge">
                        <input type="hidden" name="intent" value="contribute" />
                        <IdemKey />
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
                      <IdemKey />
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
                  <p className="pn-small pn-muted">Settled is not the same as marked paid: settled counts money the buyer confirmed after purchase.</p>
                  <p className="pn-small">{canMarkPaid
                    ? 'Mark paid only once you pledged and sent that money outside Piñata. Piñata never takes or moves money.'
                    : 'Payment updates are paused for this pool. Existing records are unchanged.'}</p>
                  {canMarkPaid && (
                    <form action={itemPath} method="post" className="pn-actions">
                      <input type="hidden" name="intent" value="mark_paid" />
                      <IdemKey />
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
                  {canRecordPurchase && (
                    <form action={itemPath} method="post" className="pn-actions">
                      <input type="hidden" name="intent" value="purchase" />
                      <IdemKey />
                      <input type="hidden" name="poolId" value={pool.id} />
                      <Button type="submit">I bought this gift</Button>
                    </form>
                  )}
                </section>

                {canEditPayout && (
                  <section className="pn-item pn-stack" aria-labelledby="item-payout-heading">
                    <h3 id="item-payout-heading">Where pledgers pay you</h3>
                    <p className="pn-small pn-muted">Your bank details, so friends can settle by hand. They stay hidden until someone pledges and you switch sharing on.</p>
                    <form action={itemPath} method="post" className="pn-stack">
                      <input type="hidden" name="intent" value="save_payout" />
                      <IdemKey />
                      <input type="hidden" name="poolId" value={pool.id} />
                      <Field label="Account holder" name="accountHolder" id="payout-holder" type="text" autoComplete="off" required maxLength={80} defaultValue={pool.payout?.accountHolder} />
                      <Field label="Bank" name="bankName" id="payout-bank" type="text" autoComplete="off" required maxLength={80} defaultValue={pool.payout?.bankName} />
                      <Field label="Account number" name="accountNumber" id="payout-account" type="text" inputMode="numeric" autoComplete="off" required maxLength={24} defaultValue={pool.payout?.accountNumber} hint="Digits only, 6–20 of them." />
                      <Field label="Branch code" name="branchCode" id="payout-branch" type="text" inputMode="numeric" autoComplete="off" required maxLength={9} defaultValue={pool.payout?.branchCode} hint="Six digits." />
                      <Field label="Account type (optional)" name="accountType" id="payout-type" type="text" autoComplete="off" maxLength={20} placeholder="cheque, savings or transmission" defaultValue={pool.payout?.accountType ?? undefined} />
                      <Field label="Reference prefix (optional)" name="referencePrefix" id="payout-prefix" type="text" autoComplete="off" maxLength={12} defaultValue={pool.payout?.referencePrefix ?? undefined} hint="Letters and digits, printed before each payer reference." />
                      <div className="pn-field">
                        <label htmlFor="payout-share">
                          <input className="pn-input" id="payout-share" name="shareConsent" type="checkbox" value="on" defaultChecked={pool.payout?.shareConsent ?? false} />
                          {' '}Share these details with anyone who pledged
                        </label>
                      </div>
                      <div className="pn-actions">
                        <Button type="submit" variant="secondary">Save payment details</Button>
                      </div>
                    </form>
                    {pool.payout !== null && (
                      <Cta href={`${itemPath}/pay`}>Payment details and share</Cta>
                    )}
                    {pool.payout !== null && !pool.payout.shareConsent && (
                      <p className="pn-small pn-muted">Payment details stay hidden until you switch sharing on.</p>
                    )}
                    {pool.tally.length > 0 && (
                      <section className="pn-stack pn-stack-sm" aria-labelledby="item-tally-heading">
                        <h3 id="item-tally-heading">Who pledged what</h3>
                        <ul className="pn-list">
                          {pool.tally.map((row) => (
                            <li key={row.userId} className="pn-item pn-stack pn-stack-sm">
                              <p><strong>{row.displayName}</strong> · <Money>{row.amount}</Money> · ref {row.reference}</p>
                              <p className="pn-small pn-muted">{contributionStatusLabel(row.status)}</p>
                              {row.status === 'promised' && (
                                <form action={itemPath} method="post" className="pn-actions">
                                  <input type="hidden" name="intent" value="mark_paid" />
                                  <IdemKey />
                                  <input type="hidden" name="poolId" value={pool.id} />
                                  <input type="hidden" name="userId" value={row.userId} />
                                  <Button type="submit" variant="secondary">Mark {row.displayName} paid</Button>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </section>
                )}
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
