import type { Metadata } from 'next';
import { Cta, EmptyState, Panel, Screen } from '@/components/ui';

// The offline surface is a public page: no session, no circle, no data. The service worker
// serves the cached copy of this document for any navigation it cannot complete, including a
// navigation to `/c/<slug>`, so this file must never name a circle, a person or an amount, and
// must not imply that anything was saved or sent.
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'You are offline',
  description: 'Piñata could not reach the server. Nothing has been saved or sent.',
};

export default function OfflinePage() {
  const base = process.env.PINATA_BASE_PATH ?? '';
  return (
    <Screen privacyHref={`${base}/privacy`}
      title="You are offline"
      lede="Piñata can’t reach the server right now."
    >
      <Panel className="pn-stack">
        <h2>Nothing was saved or sent</h2>
        <p>
          Anything you had typed on the previous screen was not recorded, and no wish, claim or
          contribution has changed. Reconnect and open your circle link again to pick up where
          you left off.
        </p>
        <p className="pn-small pn-muted">
          Piñata holds no money, so nothing here can have been paid or pledged while you were away.
        </p>
      </Panel>

      <EmptyState title="Waiting for a connection" action={<Cta href={`${base}/app`}>Try again</Cta>}>
        Your gift plans are safe on the server. Reconnect and try again.
      </EmptyState>
    </Screen>
  );
}
