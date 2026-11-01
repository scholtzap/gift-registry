import { Button, Field, Panel, Screen, TurnstileWidget } from '@/components/ui';

/** CR-UX-02: the creation entry, in the same shell/type as the circle screens. */
export const PROXY_EXPLAINER =
  'You are starting a circle for someone else. They never need an account; you will get a link to share with the group, and the plan stays hidden from them.';

export function LookupSearchScreen({ basePath = '' }: { basePath?: string } = {}) {
  return (
    <Screen homeHref={`${basePath}/app`} privacyHref={`${basePath}/privacy`}
      title="Buying a gift for someone?"
      eyebrow="Start a circle"
      lede="Type their number and we will help you start. Nothing about anyone is shown here."
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        <Panel className="pn-stack">
          <p>{PROXY_EXPLAINER}</p>
          <form method="post" action={`${basePath}/lookup`} className="pn-stack">
            <Field
              label="Their WhatsApp number (international form)"
              name="phone"
              id="lookup-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
            />
            <div className="pn-actions">
              <Button type="submit" variant="primary" block>Continue</Button>
            </div>
          </form>
        </Panel>
      </div>
    </Screen>
  );
}

export function ProxyOfferScreen({ basePath = '' }: { basePath?: string } = {}) {
  return (
    <Screen homeHref={`${basePath}/app`} privacyHref={`${basePath}/privacy`}
      title="Start a gift circle for someone"
      eyebrow="For someone else"
      lede={PROXY_EXPLAINER}
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        <Panel className="pn-stack">
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
      </div>
    </Screen>
  );
}
