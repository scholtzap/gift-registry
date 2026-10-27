import { AmountField, Badge, Button, Field, Notice, Panel, Screen, type CircleContext, type NavItem } from '@/components/ui';
import { minorToRandInput } from '@/lib/money';

export type DraftScreenData = {
  id?: string;
  title: string;
  retailer: string | null;
  priceMinor: number | null;
  /** What the person typed, echoed back unchanged after a rejected submit. */
  priceRand?: string;
  currency: string;
  source?: string;
};

// Adder-scoped draft only. The route supplies the authenticated role and private, no-store headers.
// Both projections land here: `role` selects the copy and the hidden visibility value.
export function DraftConfirmScreen({ draft, basePath, role, notice, circle }: {
  draft: DraftScreenData | null;
  basePath: string;
  role: 'owner' | 'friend';
  notice?: string;
  circle?: CircleContext;
}) {
  const currency = draft?.currency ?? 'ZAR';
  const supportsCurrency = currency === 'ZAR';
  const isOwner = role === 'owner';
  const priceDefault = !supportsCurrency ? ''
    : draft?.priceRand ?? (typeof draft?.priceMinor === 'number' ? minorToRandInput(draft.priceMinor) : '');
  const nav: NavItem[] = [
    { href: basePath, label: isOwner ? 'Wishes' : 'Ledger', icon: 'ledger' },
    { href: `${basePath}/draft`, label: isOwner ? 'Add' : 'Suggest', icon: 'add', current: true },
    { href: `${basePath}/settings`, label: 'Settings', icon: 'settings' },
  ];

  return (
    <Screen
      title={draft ? 'Review your draft' : 'Add an item manually'}
      lede={draft
        ? 'Check the title, retailer and price, and correct anything that is wrong.'
        : 'No WhatsApp draft is loaded. Type the item details below.'}
      backHref={basePath}
      backLabel="Back to circle"
      circle={circle}
      nav={nav}
    >
      {/* One form with one primary action, so the reading measure holds the width instead of
          `.pn-cols`: splitting three fields across columns would only scatter the confirm path. */}
      <div className="pn-stack pn-measure">
        {notice && <Notice kind="success">{notice}</Notice>}

        {/* A foreign-currency draft is a refusal, not a conversion: error severity, never a note. */}
        {!supportsCurrency && (
          <Notice kind="error">
            <p>This draft uses {currency}, not ZAR. Confirmation is unavailable. Return to the circle
              and start a manual entry in ZAR; no currency conversion has been made.</p>
          </Notice>
        )}

        <div className="pn-row">
          <Badge tone="open">{draft ? 'Unconfirmed draft' : 'Manual entry'}</Badge>
          {role === 'friend' && <Badge tone="human">Friends only</Badge>}
        </div>

        {/* One note, not two stacked surfaces: both sentences answer the same question,
            "what happens if I confirm", and the friend's privacy line is part of that answer. */}
        <p className="pn-note">
          Nothing is added until you confirm.
          {role === 'friend' && <> The recipient won&apos;t see this item; it is added for friends only.</>}
        </p>

        <form action={`${basePath}/draft`} method="post" className="pn-stack">
          <input type="hidden" name="intent" value="confirm" />
          <input type="hidden" name="currency" value={currency} />
          <input type="hidden" name="visibility" value={role === 'friend' ? 'friend_only' : 'owner_visible'} />
          {draft?.id && <input type="hidden" name="ingestEventId" value={draft.id} />}

          <Panel className="pn-stack">
            <h2>Item details</h2>
            <Field
              label="Title"
              name="title"
              id="draft-title"
              defaultValue={draft?.title ?? ''}
              required
              maxLength={200}
              hint="Up to 200 characters. Include the size or colour if it matters."
            />
            <Field
              label="Retailer (optional)"
              name="retailer"
              id="draft-retailer"
              defaultValue={draft?.retailer ?? ''}
              maxLength={200}
              hint="Leave blank if you do not know where to buy it."
            />
          </Panel>

          {/* The only toned surface on the screen: this panel is about money, so it takes the green. */}
          <Panel className="pn-stack" tone="money">
            <h2>Price</h2>
            <AmountField
              label="Price in rand"
              name="priceRand"
              id="draft-price"
              defaultValue={priceDefault}
              hint="Like 1899 or 249.50. Leave blank if the price is unknown."
            />
            <p className="pn-small pn-muted">Check the price yourself before confirming.</p>
          </Panel>

          <div className="pn-actions">
            <Button type="submit" disabled={!supportsCurrency}>Confirm and add item</Button>
          </div>
        </form>

        {/* Intake explains how a draft arrives; it is context, not a step, so it stays tight and
            muted below the form rather than competing with it. */}
        <Panel as="aside" className="pn-stack pn-panel-tight">
          <h2>WhatsApp intake</h2>
          <p>
            When WhatsApp intake is configured and this circle is registered, send a voice note,
            product screenshot or retailer link to the Piñata business number. Intake creates a
            draft to review here, not a confirmed item.
          </p>
          <p className="pn-small pn-muted">
            This screen does not connect to WhatsApp or send messages. If you have not been given
            the business number, use manual entry instead.
          </p>
        </Panel>
      </div>
    </Screen>
  );
}
