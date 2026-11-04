import { Button, Cta, EmptyState, Money, Notice, Panel, Screen, type CircleContext } from '@/components/ui';

export interface PickerAvailableItem {
  id: string;
  title: string;
  price: string | null;
}

export interface PickerLinkedItem extends PickerAvailableItem {
  visible: boolean;
  previewed: boolean;
}

/**
 * The per-circle link picker (docs/plans/shared-registry-and-circles.md Q4):
 * the receiver's wishes split into already-in-this-circle and still-outside,
 * in their own projection only. New links stay hidden until the receiver runs
 * the preview and shows them — hiding is always one tap, showing never is.
 */
export function RegistryPickerScreen({ circleName, basePath, circle, available, linked, notice }: {
  circleName: string;
  basePath: string;
  circle: CircleContext;
  available: PickerAvailableItem[];
  linked: PickerLinkedItem[];
  notice?: string;
}) {
  return (
    <Screen
      title={`Sharing in ${circleName}`}
      backHref={basePath}
      backLabel="Back to your wishes"
      circle={circle}
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        {notice !== undefined && <Notice kind="error">{notice}</Notice>}

        <Panel as="section" className="pn-stack">
          <h2>In this circle</h2>
          {linked.length === 0 ? (
            <p className="pn-muted">Nothing from your registry is in this circle yet.</p>
          ) : (
            <ul className="pn-list">
              {linked.map((item) => (
                <li key={item.id}>
                  <div className="pn-between">
                    <div>
                      <p><strong>{item.title}</strong></p>
                      {item.price !== null
                        ? <p className="pn-price pn-price-sm"><Money>{item.price}</Money></p>
                        : <p className="pn-muted pn-small">No price yet</p>}
                      <p className="pn-small pn-muted">{item.visible ? 'Shown here' : 'Hidden here'}</p>
                    </div>
                    <div className="pn-actions">
                      {item.visible ? (
                        <form action={`${basePath}/registry`} method="post">
                          <input type="hidden" name="intent" value="hide" />
                          <input type="hidden" name="registryItemId" value={item.id} />
                          <Button type="submit" variant="secondary">Hide</Button>
                        </form>
                      ) : (
                        <form action={`${basePath}/registry`} method="post">
                          <input type="hidden" name="intent" value="show" />
                          <input type="hidden" name="registryItemId" value={item.id} />
                          <Button type="submit">Show</Button>
                        </form>
                      )}
                      <form action={`${basePath}/registry`} method="post">
                        <input type="hidden" name="intent" value="unlink" />
                        <input type="hidden" name="registryItemId" value={item.id} />
                        <Button type="submit" variant="quiet">Remove</Button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel as="section" className="pn-stack">
          <h2>From your registry</h2>
          {available.length === 0 ? (
            <EmptyState title="Everything is already in this circle">
              Save more wishes from your circles page, then come back to share them here.
            </EmptyState>
          ) : (
            <ul className="pn-list">
              {available.map((item) => (
                <li key={item.id} className="pn-between">
                  <div>
                    <p><strong>{item.title}</strong></p>
                    {item.price !== null
                      ? <p className="pn-price pn-price-sm"><Money>{item.price}</Money></p>
                      : <p className="pn-muted pn-small">No price yet</p>}
                  </div>
                  <form action={`${basePath}/registry`} method="post">
                    <input type="hidden" name="intent" value="link" />
                    <input type="hidden" name="registryItemId" value={item.id} />
                    <Button type="submit" variant="secondary">Add, hidden</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <p className="pn-note">New additions stay hidden until you preview this circle and show them. Hiding is always one tap.</p>
        </Panel>

        <Panel as="section" className="pn-stack" tone="human">
          <h2>Preview this circle</h2>
          <p className="pn-muted">Check exactly what this circle shows before anything new goes out.</p>
          <form action={`${basePath}/registry`} method="post" className="pn-actions">
            <input type="hidden" name="intent" value="preview" />
            <Button type="submit" variant="primary">Preview this circle</Button>
          </form>
        </Panel>
      </div>
    </Screen>
  );
}

/**
 * The mandatory per-circle preview: the exact list this circle shows, rendered
 * before the receiver may show anything new. Showing stays refused until this
 * page has run — that refusal is the mis-set-flag backstop.
 */
export function RegistryPreviewScreen({ circleName, basePath, circle, titles, showable }: {
  circleName: string;
  basePath: string;
  circle: CircleContext;
  titles: string[];
  showable: PickerAvailableItem[];
}) {
  return (
    <Screen
      title={`Previewing ${circleName}`}
      backHref={`${basePath}/registry`}
      backLabel="Back to sharing"
      circle={circle}
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        <Panel as="section" className="pn-stack" tone="human">
          <h2>This circle shows</h2>
          {titles.length === 0 ? (
            <p className="pn-muted">Nothing yet. The list below is what your friends would open.</p>
          ) : (
            <ul className="pn-list">
              {titles.map((title) => <li key={title}><p>{title}</p></li>)}
            </ul>
          )}
        </Panel>

        <Panel as="section" className="pn-stack">
          <h2>Ready to show</h2>
          {showable.length === 0 ? (
            <p className="pn-muted">Everything added is already out, or nothing is waiting. Adding more starts hidden again.</p>
          ) : (
            <ul className="pn-list">
              {showable.map((item) => (
                <li key={item.id} className="pn-between">
                  <p><strong>{item.title}</strong></p>
                  <form action={`${basePath}/registry`} method="post">
                    <input type="hidden" name="intent" value="show" />
                    <input type="hidden" name="registryItemId" value={item.id} />
                    <Button type="submit">Show in this circle</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <Cta href={`${basePath}/registry`}>Done previewing</Cta>
        </Panel>
      </div>
    </Screen>
  );
}
