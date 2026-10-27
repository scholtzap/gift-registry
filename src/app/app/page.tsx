import { Panel, Screen } from '@/components/ui';

export default function AppEntryPage() {
  return (
    <Screen title="Open your circle" backHref="/" backLabel="Back to Piñata">
      <Panel>
        <div className="pn-stack">
          <h2>Use your invitation link</h2>
          <p>Open the circle link shared in your WhatsApp group. It takes you to your wishlist or the friends’ gift plan.</p>
          <p className="pn-muted">If you don’t have the link, ask the person organizing your circle to share it with you.</p>
        </div>
      </Panel>
    </Screen>
  );
}
