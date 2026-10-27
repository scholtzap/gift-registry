import { AttributeList, Badge, Cta, EmptyState, EventDate, ItemPhoto, Meter, Money, Panel, Screen } from '@/components/ui';
import type { NavItem } from '@/components/ui';
import { itemStatus, poolPercent } from '@/components/status';
import { formatMinor } from '@/lib/money';
import type { FriendCircleView, FriendItemView } from '@/server/views';

// One sticker card per gift: title and price, one plain-language status, and the pool's money
// on a green sub-block when there is one.
function LedgerRow({ item, basePath }: { item: FriendItemView; basePath: string }) {
  const pool = item.pool;
  const status = itemStatus(item);
  return (
    <li>
      <article className="pn-item">
        <div className="pn-between">
          <div className="pn-item-lead">
            {item.hasPhoto && <ItemPhoto basePath={basePath} itemId={item.id} />}
            <div className="pn-item-head">
              <h3 className="pn-item-title">
                <Cta href={`${basePath}/items/${item.id}`} size="title">{item.title}</Cta>
              </h3>
              {item.retailer !== null && <p className="pn-muted">{item.retailer}</p>}
            </div>
          </div>
          {item.price === null ? (
            <p className="pn-muted">No price yet</p>
          ) : (
            <p className="pn-price pn-price-sm">{item.price}</p>
          )}
        </div>

        <div className="pn-item-meta">
          <Badge tone={status.tone}>{status.label}</Badge>
          {item.secret && <Badge tone="human">Secret idea · hidden from them</Badge>}
          {item.addedByMe && <Badge>Your idea</Badge>}
          {pool?.iAmBuyer && <Badge tone="human">You’re the buyer</Badge>}
        </div>

        {item.status === 'tombstoned' && (
          <p className="pn-note">Gone from their list. Contributions and pool records stay here with the group.</p>
        )}

        {pool !== null && (
          <div className="pn-item pn-item-money">
            <Meter settled={pool.settled} target={pool.target} percent={poolPercent(pool)} />
            {/* Settled against target only: the list never shows a head count or pledged money. */}
            <p><Money>{pool.settled}</Money> settled of <Money>{pool.target}</Money></p>
            {pool.status === 'pivot_needed' && (
              <p className="pn-small">Pick the next step together on the gift page.</p>
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
    { href: basePath, label: 'Gifts', icon: 'ledger', current: true },
    { href: `${basePath}/draft`, label: 'Suggest', icon: 'add' },
    { href: `${basePath}/settings`, label: 'Settings', icon: 'settings' },
  ];
  // Settled money across the open pools, all in one currency or not summed at all.
  const pools = view.items.flatMap((item) => (item.pool === null ? [] : [item.pool]));
  const currencies = new Set(pools.map((pool) => pool.currency));
  const pooledMinor = pools.reduce((sum, pool) => sum + pool.settledMinor, 0);

  return (
    <Screen title="The gift list" circle={{ name: view.name, role: 'friend' }} nav={nav}>
      <div className="pn-cols">
        <section aria-label="Gift list" className="pn-stack">
          <Panel tone="human" className="pn-panel-tight">
            <p className="pn-eyebrow">{view.occasion} · <EventDate iso={view.eventDate} /></p>
            <p>Claims, pools and secret ideas live here. Keep this screen away from them.</p>
          </Panel>

          {pools.length > 0 && currencies.size === 1 && (
            <Panel tone="money" className="pn-summary">
              <p className="pn-eyebrow">In the piñata</p>
              <p className="pn-summary-figure">{formatMinor(pooledMinor, pools[0]!.currency)}</p>
              <p className="pn-muted">Settled across {pools.length} {pools.length === 1 ? 'pool' : 'pools'}. It stays shut till the party.</p>
            </Panel>
          )}

          {view.items.length === 0 ? (
            <EmptyState title="Nothing on the list yet">
              Suggest a secret gift idea for the group.
            </EmptyState>
          ) : (
            <ul className="pn-list">
              {view.items.map((item) => (
                <LedgerRow key={item.id} item={item} basePath={basePath} />
              ))}
            </ul>
          )}
        </section>

        {/* Rail last in the DOM so mobile reads the list first; CSS puts it on the right at desktop. */}
        <div className="pn-rail">
          <Panel>
            <Cta href={`${basePath}/draft`}>Suggest a secret gift</Cta>
            <Cta href={`${basePath}/settings`}>Your AI settings</Cta>
          </Panel>

          {view.attributes.length > 0 && (
            <section aria-label="Gift preferences">
              <Panel tone="human">
                <h2>Their sizes and favourites</h2>
                <p className="pn-muted">Shared with friends.</p>
                <AttributeList items={view.attributes} />
              </Panel>
            </section>
          )}
        </div>
      </div>
    </Screen>
  );
}
