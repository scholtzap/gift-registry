import { Badge, Button, Notice, Panel, Screen, type CircleContext, type NavItem } from '@/components/ui';

export type CapabilitySetting = {
  capability: string;
  label: string;
  description: string;
  enabled: boolean;
};

// Private account screen only; never include these rows in a circle projection.
export function SettingsScreen({
  settings,
  basePath,
  notice,
  circle,
}: {
  settings: CapabilitySetting[];
  basePath: string;
  notice?: string;
  circle?: CircleContext;
}) {
  const isOwner = circle?.role === 'owner';
  const nav: NavItem[] = [
    { href: basePath, label: isOwner ? 'Wishes' : 'Ledger', icon: 'ledger' },
    { href: `${basePath}/draft`, label: isOwner ? 'Add' : 'Suggest', icon: 'add' },
    { href: `${basePath}/settings`, label: 'Settings', icon: 'settings', current: true },
  ];

  return (
    <Screen
      title="Settings"
      lede={"These choices apply to your actions, not anyone else's. They are private to your account."}
      backHref={basePath}
      backLabel="Back to circle"
      circle={circle}
      nav={nav}
    >
      {/* Switches first, the long consent explainer last in the DOM: mobile reads the choices
          before the fine print, and from 64rem CSS lifts the explainer into a sticky rail. */}
      <div className="pn-stack pn-cols">
        <section className="pn-stack" aria-labelledby="capabilities-heading">
          <h2 id="capabilities-heading">AI capabilities</h2>

          {notice && <Notice kind="success">{notice}</Notice>}

          {settings.length === 0 ? (
            <p className="pn-muted">No capability settings to show.</p>
          ) : (
            <ul className="pn-list">
              {settings.map((setting, index) => {
                const labelId = `setting-${index}-label`;
                const descriptionId = `setting-${index}-description`;
                const stateId = `setting-${index}-state`;

                return (
                  <li key={setting.capability}>
                    {/* A switch row is neutral structure, so it stays on the white surface; only
                        the badge carries the state. */}
                    <Panel className="pn-panel-tight pn-stack">
                      <form
                        action={`${basePath}/settings`}
                        method="post"
                        className="pn-stack"
                        aria-labelledby={labelId}
                        aria-describedby={`${stateId} ${descriptionId}`}
                      >
                        <input type="hidden" name="capability" value={setting.capability} />
                        <input type="hidden" name="enabled" value={String(!setting.enabled)} />
                        <input type="hidden" name="intent" value="toggle" />
                        <div className="pn-between">
                          <h3 id={labelId}>{setting.label}</h3>
                          <span id={stateId}>
                            <Badge tone={setting.enabled ? 'blue' : 'neutral'}>
                              {setting.enabled ? 'On' : 'Off'}
                            </Badge>
                          </span>
                        </div>
                        <p id={descriptionId} className="pn-muted">{setting.description}</p>
                        <div className="pn-actions">
                          <Button type="submit" variant="secondary">
                            {setting.enabled ? 'Disable' : 'Enable'} {setting.label}
                          </Button>
                        </div>
                      </form>
                    </Panel>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="pn-rail">
          <Panel as="aside" className="pn-stack pn-panel-tight">
            <p>
              Turn AI on for the actions you want help with. When you turn an action off, Piñata
              will not use AI for it.
            </p>
            <p className="pn-small pn-muted">
              When a capability is off, use its manual or plain version: type gift details yourself or
              use a plain card. The action explains the fallback. If settings cannot be checked, that
              is an availability problem, not a change to your choices.
            </p>
          </Panel>
        </div>
      </div>
    </Screen>
  );
}
