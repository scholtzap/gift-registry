import { AttributeList, Badge, Cta, EmptyState, EventDate, ItemPhoto, Panel, Screen, type CircleContext, type NavItem } from '@/components/ui';
import type { OwnerCircleView, OwnerItemView } from '@/server/views';

// Owner projection only; this screen never fetches data or reads coordination state.
export function OwnerLedgerScreen({ view, basePath }: { view: OwnerCircleView; basePath: string }) {
  const draftHref = `${basePath}/draft`;
  const settingsHref = `${basePath}/settings`;
  const circleHref = `/c/${encodeURIComponent(view.shareSlug)}`;

  const nav: NavItem[] = [
    { href: basePath, label: 'Wishes', icon: 'ledger', current: true },
    { href: draftHref, label: 'Add', icon: 'add' },
    { href: settingsHref, label: 'Settings', icon: 'settings' },
  ];

  return (
    <Screen
      title="Your wishes"
      circle={{ name: view.name, role: 'owner' }}
      nav={nav}
    >
      {/* The rail is the last child: from 64rem CSS lifts it beside the ledger as a sticky summary,
          while mobile keeps the ledger first and the circle link last. */}
      <div className="pn-stack pn-cols">
        <div className="pn-stack">
          <div className="pn-actions">
            <a className="pn-button pn-button-primary" href={draftHref}>Add a wish</a>
            <Cta href={settingsHref}>Your AI settings</Cta>
          </div>

          <section className="pn-stack" aria-label="Your wishes">
            {view.items.length === 0 ? (
              <EmptyState title="No wishes yet">
                Start with something you would love. Add a wish, then check the details before confirming it.
              </EmptyState>
            ) : (
              <ul className="pn-list">
                {view.items.map((item) => (
                  <li key={item.id}>
                    <Panel className="pn-panel-tight pn-stack" tone="human">
                      <div className="pn-item-lead">
                        {item.hasPhoto && <ItemPhoto basePath={basePath} itemId={item.id} />}
                        <div className="pn-item-head">
                          <h3 className="pn-item-title">
                            <Cta href={`${basePath}/items/${encodeURIComponent(item.id)}`} size="title">
                              {item.title}
                            </Cta>
                          </h3>
                          {item.retailer !== null && <p className="pn-small pn-muted">{item.retailer}</p>}
                        </div>
                      </div>
                      <div className="pn-between">
                        <p className={item.price === null ? 'pn-muted' : 'pn-price'}>
                          {item.price ?? 'Price not added'}
                        </p>
                        <Badge tone={item.confirmed ? 'done' : 'open'}>
                          {item.confirmed ? 'On your list' : 'Check and confirm'}
                        </Badge>
                      </div>
                    </Panel>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {view.accessRequests.length > 0 && (
            <Panel className="pn-stack">
              <h2>People asking to join</h2>
              <ul className="pn-list">
                {view.accessRequests.map((request) => (
                  <li key={request.id}>
                    <div className="pn-between">
                      <p>{request.requesterName}</p>
                      <form method="post" action={`${basePath}/requests`} className="pn-actions">
                        <input type="hidden" name="requestId" value={request.id} />
                        <button type="submit" name="intent" value="accept">Let them in</button>
                        <button type="submit" name="intent" value="reject" className="pn-button pn-button-secondary">Not now</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel className="pn-stack">
            <h2>Your sizes and preferences</h2>
            {view.attributes.length === 0 ? (
              <p className="pn-muted">No sizes or preferences added yet.</p>
            ) : (
              <AttributeList items={view.attributes} />
            )}
          </Panel>

          <Panel className="pn-stack">
            <h2>Check drafts before you confirm</h2>
            <p>After a voice note becomes a draft, check the title and price before you confirm.</p>
            <Cta href={draftHref}>Review a draft</Cta>
          </Panel>
        </div>

        <aside className="pn-rail" aria-label="Circle summary">
          <Panel className="pn-stack">
            <h2>One link for your group</h2>
            <div className="pn-stack pn-stack-sm">
              <p>{view.occasion}</p>
              <p className="pn-small">
                Party day: <EventDate iso={view.eventDate} />
              </p>
            </div>
            <hr className="pn-divider" />
            <p className="pn-small pn-muted">Open the circle link, then copy its address into your WhatsApp group.</p>
            <Cta href={circleHref}>Open your circle link</Cta>
          </Panel>
        </aside>
      </div>
    </Screen>
  );
}

/**
 * One wish in the owner's own projection: what they asked for, and nothing about who has
 * claimed or pooled it. The owner route builds this from `ownerCircleView`, which has already
 * had the coordination columns removed.
 */
export function OwnerItemScreen({ item, basePath, circle }: {
  item: OwnerItemView;
  basePath: string;
  circle: CircleContext;
}) {
  const nav: NavItem[] = [
    { href: basePath, label: 'Wishes', icon: 'ledger', current: true },
    { href: `${basePath}/draft`, label: 'Add', icon: 'add' },
    { href: `${basePath}/settings`, label: 'Settings', icon: 'settings' },
  ];

  return (
    <Screen
      title={item.title}
      backHref={basePath}
      backLabel="Back to your wishes"
      circle={circle}
      nav={nav}
    >
      <div className="pn-stack pn-measure">
        <Panel className="pn-stack" tone="human">
          <h2>Your wish</h2>
          {item.hasPhoto && <ItemPhoto basePath={basePath} itemId={item.id} large />}
          <div className="pn-between">
            <p className={item.price === null ? 'pn-muted' : 'pn-price'}>{item.price ?? 'Price not added'}</p>
            <Badge tone={item.confirmed ? 'done' : 'open'}>
              {item.confirmed ? 'On your list' : 'Check and confirm'}
            </Badge>
          </div>
          {item.retailer !== null && <p className="pn-small pn-muted">{item.retailer}</p>}
        </Panel>
        <p className="pn-note">You choose what is on your list. How it gets bought stays with your friends until the gift is handed over.</p>
      </div>
    </Screen>
  );
}
