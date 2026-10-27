import { Badge, Button, Field, Notice, Panel, Screen } from '@/components/ui';

// Public gate only: notice is generic server copy, never a circle projection.
export interface JoinScreenProps {
  notice?: string;
  action?: string;
}

export function JoinScreen({ notice, action = '' }: JoinScreenProps) {
  // A door, not a room: no circle context, no section nav, one measure column on wide rhythm.
  return (
    <Screen
      title="Join this circle"
      eyebrow="Keep the surprise"
      lede="A little planning between friends. A gift they won't see coming."
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        <Panel className="pn-stack">
          <div className="pn-row">
            <Badge tone="pink">Invite list</Badge>
            <span className="pn-small pn-muted">For invited friends</span>
          </div>
          <p>Enter the name you want on the card and the WhatsApp number on the invite list.</p>
          {notice ? <Notice kind="error">{notice}</Notice> : null}

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
            />
            <p className="pn-small pn-muted">
              We check the invite list. This does not verify that you control the number.
            </p>
            <div className="pn-actions">
              <Button type="submit" variant="primary" block>Continue</Button>
            </div>
          </form>
          <p className="pn-small pn-muted">
            Not on the list? Ask the person who shared this link to add you.
          </p>
        </Panel>

        <aside className="pn-panel pn-stack" aria-label="Gift privacy">
          <h2>The surprise stays with friends</h2>
          <p>
            The person receiving the gift cannot see claims, pooled amounts or friend suggestions.
            Circle details stay behind this gate.
          </p>
        </aside>
      </div>
    </Screen>
  );
}
