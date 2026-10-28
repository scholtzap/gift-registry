import { Badge, Button, Field, Notice, Panel, Screen } from '@/components/ui';

// Public gate only: notice is generic server copy, never a circle projection.
// `initialName`/`initialPhone` are only what this visitor just typed (CR-UX-04:
// keep them in place on rejection so Ask to be added needs no retyping).
export interface JoinScreenProps {
  notice?: string;
  action?: string;
  initialName?: string;
  initialPhone?: string;
  rejected?: boolean;
}

export function JoinScreen({ notice, action = '', initialName, initialPhone, rejected }: JoinScreenProps) {
  // A door, not a room: no circle context, no section nav, one measure column on wide rhythm.
  return (
    <Screen
      title="Join this circle"
      eyebrow="Keep the surprise"
      lede="Plan the gift with the rest of the group. The person you're buying for can't see any of it."
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        <Panel className="pn-stack">
          <div className="pn-row">
            <Badge tone="human">Invite list</Badge>
            <span className="pn-small pn-muted">For invited friends</span>
          </div>
          <p>Enter the name you want on the card and the WhatsApp number on the invite list.</p>
          {notice ? <Notice kind="error">{notice}</Notice> : null}

          {rejected ? (
            <div className="pn-stack pn-stack-sm">
              <h2>What to check</h2>
              <ul className="pn-list">
                <li>Use the full international form: a plus sign, the country code, then the number, with no spaces or leading zero.</li>
                <li>Use the number the organiser invited — the number they have for you, which may be an older number.</li>
                <li>Check each digit, then try Continue again — or ask to be added below and keep the name and number as they are.</li>
              </ul>
            </div>
          ) : null}

          <form method="post" action={action} className="pn-stack">
            <Field
              label="Your name"
              name="name"
              id="join-name"
              type="text"
              autoComplete="name"
              required
              maxLength={80}
              placeholder="Name for the card"
              hint="Shown to friends and used on the gift card."
              defaultValue={initialName}
            />
            <Field
              label="WhatsApp number"
              name="phone"
              id="join-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              maxLength={20}
              hint="Use full international form: a plus sign, the country code, then the number."
              defaultValue={initialPhone}
            />
            <p className="pn-small pn-muted">
              We check the invite list. This does not verify that you control the number.
            </p>
            <div className="pn-actions">
              {rejected ? (
                <>
                  <button type="submit" name="intent" value="request_access" className="pn-button pn-button-primary pn-button-block">
                    Ask to be added
                  </button>
                  <Button type="submit" variant="secondary" block>Continue</Button>
                </>
              ) : (
                <>
                  <Button type="submit" variant="primary" block>Continue</Button>
                  <button type="submit" name="intent" value="request_access">
                    Ask to be added
                  </button>
                </>
              )}
            </div>
          </form>
          <p className="pn-small pn-muted">
            Not on the list? Ask to be added, and the person who shared this link will see
            your request next time they open it. Nothing is sent to them.
          </p>
        </Panel>

        <aside className="pn-panel pn-stack" aria-label="Gift privacy">
          <h2>The surprise stays with friends</h2>
          <p>
            The person receiving the gift cannot see claims, pooled amounts or friend suggestions.
            Only people on the invite list can open this circle.
          </p>
        </aside>
      </div>
    </Screen>
  );
}
