import { Button, Cta, Field, Notice, Panel, Screen, TurnstileWidget } from '@/components/ui';

/**
 * CR-UX-01 entry hub: one door with three honest actions. This screen only
 * renders already-public copy plus the caller's own typed draft on a rejected
 * submit; it never reads a circle, so it is safe on the public projection.
 * `basePath` is the deployment prefix (PINATA_BASE_PATH, '' in dev/tests) so
 * form actions resolve under /app in production and at the root in tests.
 */
export function HubScreen({ basePath = '', notice, initial }: {
  basePath?: string;
  notice?: string;
  initial?: { name?: string; occasion?: string; eventDate?: string; wish?: string };
}) {
  return (
    <Screen
      homeHref={`${basePath}/app`}
      privacyHref={`${basePath}/privacy`}
      title="Start your circle"
      eyebrow="Piñata"
      lede="Create your own circle, start one for someone else, or open a circle you already have."
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        {notice !== undefined && <Notice kind="error">{notice}</Notice>}

        <Panel as="section" className="pn-stack">
          <h2>Create my circle</h2>
          <p className="pn-muted">
            Your circle is yours: you add wishes, you get the link, and friends plan
            behind it without you seeing who claimed what.
          </p>
          <form method="post" action={`${basePath}/app/create`} className="pn-stack">
            <Field label="Your name" name="name" id="hub-name" type="text" autoComplete="name" required maxLength={80} defaultValue={initial?.name} />
            <Field label="Occasion" name="occasion" id="hub-occasion" type="text" required maxLength={80} defaultValue={initial?.occasion} placeholder="Birthday" />
            <Field label="Party date (optional)" name="eventDate" id="hub-event-date" type="date" defaultValue={initial?.eventDate} hint="The day the gift is handed over. You can change it later." />
            <p className="pn-small pn-muted">
              We ask for your WhatsApp number so friends can join against it and find
              your circle. It is stored hashed on the invite list, never shown publicly.
            </p>
            <Field label="Your WhatsApp number (international form)" name="phone" id="hub-phone" type="tel" autoComplete="tel" inputMode="tel" required />
            <Field label="First wish (optional)" name="wish" id="hub-wish" type="text" maxLength={120} defaultValue={initial?.wish} placeholder="Something you would love" />
            <TurnstileWidget />
            <div className="pn-actions">
              <Button type="submit" variant="primary" block>Create my circle</Button>
            </div>
          </form>
        </Panel>

        <Panel as="section" className="pn-stack">
          <h2>Start a circle for someone</h2>
          <p className="pn-muted">
            Planning a surprise for someone else? Start their circle and share the
            link with the group — the plan stays hidden from them.
          </p>
          <div className="pn-actions">
            <Cta href={`${basePath}/lookup`}>Start a circle for someone</Cta>
          </div>
        </Panel>

        <Panel as="section" className="pn-stack">
          <h2 id="open-my-circle">Open my circle</h2>
          <p className="pn-muted">Enter the email or phone on your circle. Anyone else uses the link.</p>
          <form method="post" action={`${basePath}/app/find`} className="pn-stack">
            <Field label="Email or phone number" name="identifier" id="hub-open-identifier" type="text" autoComplete="username" required placeholder="you@example.test" />
            <TurnstileWidget />
            <div className="pn-actions">
              <Button type="submit" variant="primary" block>Send my code</Button>
            </div>
          </form>
        </Panel>
      </div>
    </Screen>
  );
}
