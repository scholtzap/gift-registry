import { Button, Field, Notice, Panel, Screen, TurnstileWidget } from '@/components/ui';

/**
 * Email return path (docs/plans/otp-return-path.md). Public entry screen:
 * it renders the caller's own typed identifier and fixed copy. It never
 * receives a circle, an address on record, or a code.
 */
export function FindCirclesScreen({ basePath, notice }: {
  basePath: string;
  notice?: string;
}) {
  return (
    <Screen
      privacyHref={`${basePath}/privacy`}
      title="Open my circles"
      eyebrow="Piñata"
      lede="Enter the email or phone on your circles. If it's yours, a code is on its way. Anyone else uses the link."
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        {notice !== undefined && <Notice kind="error">{notice}</Notice>}
        <Panel as="section" className="pn-stack">
          <form action={`${basePath}/app/find`} method="post" className="pn-stack">
            <Field label="Email or phone number" name="identifier" id="find-identifier" type="text"
              required autoComplete="username" placeholder="you@example.test" />
            <p className="pn-hint pn-small pn-muted">This opens your circles. It answers the same way either way. Friends use the link you share.</p>
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

export function VerifyCodeScreen({ basePath, identifier, notice }: {
  basePath: string;
  identifier: string;
  notice?: string;
}) {
  const waiting = notice !== undefined && /code is on its way/i.test(notice);
  return (
    <Screen
      privacyHref={`${basePath}/privacy`}
      title="Enter the code"
      eyebrow="Piñata"
      lede="Open the email we sent, then type the six digits here to reach your circles."
    >
      <div className="pn-measure-sm pn-stack pn-stack-lg">
        {waiting ? (
          <Notice kind="success" title="Next: enter your code">
            <p>{notice}</p>
            <p className="pn-banner-cta-hint">Open that email, then type the six digits in the field below to reach your circles.</p>
          </Notice>
        ) : notice !== undefined ? (
          <Notice kind="error">{notice}</Notice>
        ) : null}
        <Panel as="section" className="pn-stack">
          <form action={`${basePath}/app/verify`} method="post" className="pn-stack">
            <input type="hidden" name="identifier" value={identifier} />
            <Field label="Code" name="code" id="verify-code" type="text" required
              autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder="6 digits" />
            <TurnstileWidget />
            <div className="pn-actions">
              <Button type="submit" variant="primary" block>Open my circles</Button>
            </div>
          </form>
        </Panel>
      </div>
    </Screen>
  );
}
