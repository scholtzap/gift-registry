import { AmountField, Button, Cta, EmptyState, Field, Money, Notice, Panel, Screen } from '@/components/ui';
import { CURRENCIES, currencyLabel } from '@/lib/money';
import type { DashboardView } from '@/server/views/dashboard';

/**
 * The `/app` dashboard (docs/plans/shared-registry-and-circles.md Q3, Q7).
 * Signed-in home. "Gifts for you" and "Gifts for others" are the two lists.
 * The registry renders only for an owner session. Nothing here names claim,
 * pool, or contributor money state.
 */
export function DashboardScreen({ view, basePath, notice }: {
  view: DashboardView;
  basePath: string;
  notice?: string;
}) {
  const isOwner = view.role === 'owner';
  return (
    <Screen
      privacyHref={`${basePath}/privacy`}
      title="Your circles"
      eyebrow="Piñata"
      lede={isOwner
        ? 'Save each wish once, then choose which circle shows it.'
        : 'Every circle you can open, in one place.'}
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        {notice !== undefined && <Notice kind="error">{notice}</Notice>}

        {isOwner && view.registry !== null && (
          <Panel as="section" className="pn-stack">
            <h2>My registry</h2>
            <p className="pn-muted">
              One list of wishes. New wishes stay hidden until you add them to a
              circle and preview that circle.
            </p>

            <form action={`${basePath}/app/registry`} method="post" encType="multipart/form-data" className="pn-stack">
              <input type="hidden" name="intent" value="create_item" />
              <Field label="Wish" name="title" id="registry-title" type="text" required maxLength={200} placeholder="Something you would love" />
              <Field label="Shop (optional)" name="retailer" id="registry-retailer" type="text" maxLength={200} />
              <div className="pn-field">
                <label htmlFor="registry-currency">Currency</label>
                <select className="pn-input" id="registry-currency" name="currency" defaultValue="USD">
                  {CURRENCIES.map((code) => <option key={code} value={code}>{currencyLabel(code)}</option>)}
                </select>
              </div>
              <AmountField label="Price (optional)" name="priceAmount" id="registry-price" currency="USD" hint="Friends see the price in this currency." />
              <div className="pn-field">
                <label htmlFor="registry-photo">Photo (optional)</label>
                <input className="pn-input" id="registry-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
                <p className="pn-hint pn-small pn-muted">Product photo only, not people. JPEG, PNG or WebP, up to 5 MB; location and camera details are removed.</p>
              </div>
              <div className="pn-actions">
                <Button type="submit" variant="primary" block>Save to my registry</Button>
              </div>
            </form>

            {view.registry.length === 0 ? (
              <EmptyState title="No wishes saved yet">
                Save your first wish above. It stays hidden until you share it into a circle.
              </EmptyState>
            ) : (
              <ul className="pn-list">
                {view.registry.map((item) => (
                  <li key={item.id}>
                    <Panel className="pn-panel-tight pn-stack" tone={item.isPrivate ? undefined : 'human'}>
                      <div className="pn-between">
                        <h3 className="pn-item-title">{item.title}</h3>
                        {item.price !== null
                          ? <p className="pn-price"><Money>{item.price}</Money></p>
                          : <p className="pn-muted pn-small">No price yet</p>}
                      </div>
                      {item.retailer !== null && <p className="pn-small pn-muted">{item.retailer}</p>}
                      {item.isPrivate && <p className="pn-small">Private — hidden everywhere.</p>}
                      {item.links.length === 0 ? (
                        <p className="pn-small pn-muted">Not in any circle yet.</p>
                      ) : (
                        <ul className="pn-list">
                          {item.links.map((link) => (
                            <li key={link.circleId} className="pn-between">
                              <p className="pn-small">{link.circleName} · {link.visible ? 'Shown here' : 'Hidden here'}</p>
                              <Cta href={`/c/${encodeURIComponent(link.shareSlug)}/registry`}>Sharing</Cta>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="pn-actions">
                        <form action={`${basePath}/app/registry`} method="post">
                          <input type="hidden" name="intent" value="set_private" />
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="private" value={item.isPrivate ? 'off' : 'on'} />
                          <Button type="submit" variant="secondary">
                            {item.isPrivate ? 'Share from here' : 'Keep private'}
                          </Button>
                        </form>
                      </div>
                      <form action={`${basePath}/app/registry`} method="post" encType="multipart/form-data" className="pn-stack pn-stack-sm">
                        <input type="hidden" name="intent" value="set_photo" />
                        <input type="hidden" name="itemId" value={item.id} />
                        <div className="pn-field">
                          <label htmlFor={`registry-photo-${item.id}`}>{item.hasPhoto ? 'Replace photo' : 'Add a photo'}</label>
                          <input className="pn-input" id={`registry-photo-${item.id}`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
                        </div>
                        <div className="pn-actions">
                          <Button type="submit" variant="secondary">{item.hasPhoto ? 'Replace photo' : 'Add photo'}</Button>
                        </div>
                      </form>
                    </Panel>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <div className="pn-actions">
          <Cta href={`${basePath}/app/new`} variant="primary">Start another circle</Cta>
        </div>

        <Panel as="section" className="pn-stack">
          <h2 id="gifts-for-you">Gifts for you</h2>
          {view.owned.length === 0 ? (
            <p className="pn-muted">No circles where you are the recipient yet.</p>
          ) : (
            <ul className="pn-list">
              {view.owned.map((circle) => (
                <li key={circle.id} className="pn-between">
                  <div>
                    <p><strong>{circle.name}</strong></p>
                    <p className="pn-small pn-muted">{circle.occasion}</p>
                  </div>
                  <Cta href={`/c/${encodeURIComponent(circle.shareSlug)}`}>Open</Cta>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel as="section" className="pn-stack">
          <h2 id="gifts-for-others">Gifts for others</h2>
          {view.forOthers.length === 0 ? (
            <p className="pn-muted">No circles you are planning for someone else yet.</p>
          ) : (
            <ul className="pn-list">
              {view.forOthers.map((circle) => (
                <li key={circle.id} className="pn-between">
                  <div>
                    <p><strong>{circle.name}</strong></p>
                    <p className="pn-small pn-muted">{circle.occasion}</p>
                  </div>
                  <Cta href={`/c/${encodeURIComponent(circle.shareSlug)}`}>Open</Cta>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Screen>
  );
}
