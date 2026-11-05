import { Button, Cta, Field, Panel, Screen, TurnstileWidget } from '@/components/ui';

/** CR-UX-02 + flow-simplification: find public circles, or start a proxy. */
export const PROXY_EXPLAINER =
  'You are starting a circle for someone else. They never need an account; you will get a link to share with the group, and the plan stays hidden from them.';

export type PublicCircleHit = { name: string; occasion: string; shareSlug: string };

/**
 * Uniform result shell for hit and miss: same headings, same proxy CTA.
 * Miss is an empty public list — never a distinct “not registered” message.
 */
export function LookupResultScreen({
  basePath = '',
  publicCircles,
}: {
  basePath?: string;
  publicCircles: PublicCircleHit[];
} = { publicCircles: [] }) {
  return (
    <Screen
      privacyHref={`${basePath}/privacy`}
      title="Circles you can open"
      eyebrow="Lookup"
      lede="Public circles for that person, if any. Either way you can still start a surprise circle for them."
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        <Panel as="section" className="pn-stack" aria-labelledby="public-circles-title">
          <h2 id="public-circles-title">Public circles</h2>
          {publicCircles.length === 0 ? (
            <p className="pn-muted">None listed here. Friends use a shared link, or start a surprise circle below.</p>
          ) : (
            <ul className="pn-list">
              {publicCircles.map((circle) => (
                <li key={circle.shareSlug} className="pn-between">
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
        <ProxyOfferScreen basePath={basePath} embedded />
      </div>
    </Screen>
  );
}

export function LookupSearchScreen({ basePath = '' }: { basePath?: string } = {}) {
  return (
    <Screen
      privacyHref={`${basePath}/privacy`}
      title="Find or start a circle"
      eyebrow="Lookup"
      lede="Enter their email or WhatsApp number. Public circles appear when they chose to share them. Nothing here confirms whether someone is registered."
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        <Panel className="pn-stack">
          <form method="post" action={`${basePath}/lookup`} className="pn-stack">
            <input type="hidden" name="intent" value="lookup" />
            <Field
              label="Their email or WhatsApp number"
              name="identifier"
              id="lookup-identifier"
              type="text"
              autoComplete="username"
              required
              placeholder="name@example.test or +27…"
            />
            <div className="pn-actions">
              <Button type="submit" variant="primary" block>Look up</Button>
            </div>
          </form>
        </Panel>
        <p className="pn-small pn-muted">
          Starting a surprise when they have no public list? Continue after lookup, or open{' '}
          <a className="pn-link" href={`${basePath}/lookup`}>the form</a> from More on the hub.
        </p>
      </div>
    </Screen>
  );
}

export function ProxyOfferScreen({
  basePath = '',
  embedded = false,
}: {
  basePath?: string;
  embedded?: boolean;
} = {}) {
  const form = (
    <Panel className="pn-stack">
      <h2>{embedded ? 'Start a surprise circle' : 'Start a gift circle for someone'}</h2>
      <p>{PROXY_EXPLAINER}</p>
      <p className="pn-small pn-muted">
        Gift circles here begin with a link shared in your group chat. They are never
        notified, and no account is created for them.
      </p>
      <form method="post" action={`${basePath}/lookup`} className="pn-stack">
        <input type="hidden" name="intent" value="create" />
        <Field label="Your name" name="creatorName" id="proxy-creator-name" type="text" autoComplete="name" required maxLength={80} />
        <Field label="Your number (international form)" name="creatorPhone" id="proxy-creator-phone" type="tel" autoComplete="tel" inputMode="tel" required />
        <Field label="Their number (international form)" name="recipientPhone" id="proxy-recipient-phone" type="tel" autoComplete="tel" inputMode="tel" required />
        <Field label="Their name, as the group knows them" name="recipientLabel" id="proxy-recipient-label" type="text" required maxLength={80} />
        <Field label="Occasion" name="occasion" id="proxy-occasion" type="text" required maxLength={80} />
        <Field label="The day" name="eventDate" id="proxy-event-date" type="date" required />
        <Field label="The gift" name="itemTitle" id="proxy-item-title" type="text" required maxLength={120} />
        <TurnstileWidget />
        <div className="pn-actions">
          <Button type="submit" variant="primary" block>Create the circle</Button>
        </div>
      </form>
    </Panel>
  );
  if (embedded) return form;
  return (
    <Screen
      privacyHref={`${basePath}/privacy`}
      title="Start a gift circle for someone"
      eyebrow="For someone else"
      lede={PROXY_EXPLAINER}
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">{form}</div>
    </Screen>
  );
}
