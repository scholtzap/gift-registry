import { AttributeList, Badge, Cta, EmptyState, Meter, Notice, Panel, Screen, Stat, StatList } from '@/components/ui';
import type { NavItem } from '@/components/ui';
import type { FriendCircleView, FriendItemView } from '@/server/views';

function humanize(value: string) {
  const label = value.replaceAll('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Percent comes from the integers the friend projection already carries; the formatted strings
// stay the numbers on screen. Nothing here infers a pledge, a saving or a head count.
function poolPercent(pool: NonNullable<FriendItemView['pool']>) {
  return pool.targetMinor > 0 ? Math.round((pool.settledMinor / pool.targetMinor) * 100) : 0;
}

// White is structure; only the pool sub-block carries the money wash.
function LedgerRow({ item, basePath }: { item: FriendItemView; basePath: string }) {
  const pool = item.pool;
  return (
    <li>
      <article className="pn-item">
        <div className="pn-between">
          <div className="pn-item-head">
            <h3 className="pn-item-title">
              <Cta href={`${basePath}/items/${item.id}`} size="title">{item.title}</Cta>
            </h3>
            {item.retailer !== null && <p className="pn-muted">{item.retailer}</p>}
          </div>
          {item.price === null ? (
            <p className="pn-muted">Price not provided</p>
          ) : (
            <p className="pn-price pn-price-sm">{item.price}</p>
          )}
        </div>

        <div className="pn-item-meta">
          <p className="pn-small">
            Item status: <Badge tone={item.status === 'tombstoned' ? 'warning' : item.status === 'revealed' ? 'green' : 'neutral'}>{humanize(item.status)}</Badge>
          </p>
          {item.secret && <Badge tone="pink">Friend-only suggestion</Badge>}
          {item.addedByMe && <Badge tone="neutral">You suggested this</Badge>}
          {item.claimedByMe && <Badge tone="pink">Claimed by you</Badge>}
        </div>

        {item.status === 'tombstoned' && (
          <div className="pn-note">
            <p>Removed from the owner’s list. Claims and pool records remain here.</p>
            {item.tombstoneReason !== null && (
              <p className="pn-small">Reason: {humanize(item.tombstoneReason)}</p>
            )}
          </div>
        )}

        {pool !== null && (
          <div className="pn-item pn-item-money">
            <div className="pn-between">
              <p className="pn-small">
                Pool status: <Badge tone={pool.status === 'pivot_needed' ? 'warning' : pool.status === 'purchased' ? 'green' : 'blue'}>{humanize(pool.status)}</Badge>
              </p>
              {pool.iAmBuyer && <Badge tone="pink">You are the buyer</Badge>}
            </div>
            <Meter settled={pool.settled} target={pool.target} percent={poolPercent(pool)} />
            <StatList>
              <Stat label="Settled" value={pool.settled} />
              <Stat label="Pool target" value={pool.target} />
            </StatList>
            {pool.status === 'pivot_needed' && (
              <p className="pn-small">Choose the next step together on the item page.</p>
            )}
          </div>
        )}
      </article>
    </li>
  );
}

// Friend projection only; the parent route owns authentication and role selection.
export function FriendLedgerScreen({ view, basePath }: { view: FriendCircleView; basePath: string }) {
  const nav: NavItem[] = [
    { href: basePath, label: 'Ledger', icon: 'ledger', current: true },
    { href: `${basePath}/draft`, label: 'Suggest', icon: 'add' },
    { href: `${basePath}/settings`, label: 'Settings', icon: 'settings' },
  ];

  return (
    <Screen title="Gift ledger" circle={{ name: view.name, role: 'friend' }} nav={nav}>
      <Notice kind="warning">
        <p>Keep this ledger away from the gift recipient.</p>
        <p className="pn-muted">Claims, pools and secret suggestions stay on the friend side.</p>
      </Notice>

      <div className="pn-cols">
        <section aria-label="Gift ledger" className="pn-stack">
          {view.items.length === 0 ? (
            <EmptyState title="No gifts in this ledger yet.">
              Use “Suggest a secret gift” to add an idea for friends.
            </EmptyState>
          ) : (
            <ul className="pn-list">
              {view.items.map((item) => (
                <LedgerRow key={item.id} item={item} basePath={basePath} />
              ))}
            </ul>
          )}
        </section>

        {/* Rail last in the DOM so mobile reads ledger first; CSS puts it on the right at desktop. */}
        <div className="pn-rail">
          <Panel>
            <p className="pn-muted">
              {view.occasion} · <time dateTime={view.eventDate}>{view.eventDate}</time>
            </p>
            <Cta href={`${basePath}/draft`}>Suggest a secret gift</Cta>
            <Cta href={`${basePath}/settings`}>Your AI settings</Cta>
          </Panel>

          {view.attributes.length > 0 && (
            <section aria-label="Gift preferences">
              <Panel tone="human">
                <h2>Gift preferences</h2>
                <p className="pn-muted">Details shared with friends.</p>
                <AttributeList items={view.attributes} />
              </Panel>
            </section>
          )}
        </div>
      </div>
    </Screen>
  );
}
