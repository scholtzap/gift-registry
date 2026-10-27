import { Button, EmptyState, Field, Notice, Panel, Screen } from '@/components/ui';
import type { CircleContext, NavItem } from '@/components/ui';

export type CardComposerData = {
  itemId: string;
  title: string;
  pun: string | null;
  tagline: string | null;
  entries: {
    displayNameShown: string;
    message: string;
    anonymous: boolean;
  }[];
  myEntry: {
    displayNameShown: string;
    message: string;
    anonymous: boolean;
  } | null;
};

/** The name the card shows, and therefore the only name this screen may render or initial. */
function shownName(entry: { displayNameShown: string; anonymous: boolean }) {
  return entry.anonymous ? 'Anonymous' : entry.displayNameShown;
}

// Approved gift-giver projection only; the parent route enforces access.
export function CardComposerScreen({
  card,
  basePath,
  notice,
  circle,
}: {
  card: CardComposerData;
  basePath: string;
  notice?: string;
  circle?: CircleContext;
}) {
  const displayNameShown = card.myEntry?.displayNameShown ?? '';
  const message = card.myEntry?.message ?? '';
  const anonymous = card.myEntry?.anonymous ?? false;
  const cardPath = `${basePath}/items/${card.itemId}/card`;
  const nav: NavItem[] = [
    { href: basePath, label: 'Ledger', icon: 'ledger' },
    { href: `${basePath}/draft`, label: 'Suggest', icon: 'add' },
    { href: `${basePath}/settings`, label: 'Settings', icon: 'settings' },
  ];

  return (
    <Screen
      title="Gift card"
      lede={`A card for ${card.title}, ready to hand over yourself.`}
      backHref={`${basePath}/items/${card.itemId}`}
      backLabel="Back to gift"
      circle={circle}
      nav={nav}
    >
      {notice && <Notice kind="success">{notice}</Notice>}

      <div className="pn-cols">
        <div className="pn-stack">
          <Panel>
            <form
              action={cardPath}
              method="post"
              className="pn-stack"
              data-card-entry
            >
              <input type="hidden" name="intent" value="save_entry" />
              <h2>Your contribution to the card</h2>
              <p className="pn-muted">Edit only your own message. Everyone else’s words stay as they wrote them.</p>

              <Field
                label="First name on the card"
                name="displayNameShown"
                id="card-name"
                maxLength={80}
                defaultValue={displayNameShown}
                hint="A name is required unless you choose Anonymous. Up to 80 characters, without links."
              />

              <div className="pn-field">
                <label htmlFor="card-message">Your message <span className="pn-small pn-muted">(required)</span></label>
                <textarea
                  className="pn-input"
                  id="card-message"
                  name="message"
                  maxLength={200}
                  rows={4}
                  defaultValue={message}
                  aria-describedby="card-message-help"
                  required
                />
                <p id="card-message-help" className="pn-hint pn-small pn-muted">Up to 200 characters. No links. Your words appear exactly as you write them.</p>
              </div>

              <div className="pn-stack pn-stack-sm">
                <label htmlFor="card-anonymous" className="pn-row">
                  <input
                    id="card-anonymous"
                    type="checkbox"
                    name="anonymous"
                    defaultChecked={anonymous}
                    aria-describedby="card-anonymous-help"
                  />
                  Show me as Anonymous
                </label>
                <p id="card-anonymous-help" className="pn-hint pn-small pn-muted">Choose Anonymous to leave your name off the card. Your message will still appear.</p>
              </div>

              {/* White sub-block: this is a draft being typed, not the card itself. The preview
                  script owns this element's class list, so pre-wrap stays an inline declaration. */}
              <section className="pn-item pn-stack" aria-labelledby="card-my-preview-heading">
                <h3 id="card-my-preview-heading">Your message preview</h3>
                <p className="pn-item-title" data-card-name>{anonymous ? 'Anonymous' : displayNameShown}</p>
                <p data-card-message className={message ? 'pn-note' : 'pn-empty'} style={{ whiteSpace: 'pre-wrap' }}>
                  {message || 'Write your message above to preview it before saving.'}
                </p>
              </section>

              <div className="pn-actions">
                <Button type="submit">Save my message</Button>
              </div>
            </form>
          </Panel>

          <Panel>
            <section className="pn-stack" aria-labelledby="card-download-heading">
              <h2 id="card-download-heading">Download the card</h2>
              <p className="pn-muted">Save your message before generating the PNG. Only saved messages go into the file.</p>
              <div className="pn-actions">
                <form action={cardPath} method="post">
                  <input type="hidden" name="intent" value="render" />
                  <Button type="submit" variant="secondary">Generate PNG</Button>
                </form>
                <a className="pn-button pn-button-secondary" href={`${cardPath}/png`} download>Download PNG</a>
              </div>
              {card.tagline && (
                <form action={cardPath} method="post" className="pn-actions">
                  <input type="hidden" name="intent" value="pun" />
                  <Button type="submit" variant="secondary">Suggest a pun with AI</Button>
                </form>
              )}
              <p className="pn-small">Share or print it yourself when you’re ready. Piñata never sends the card or notifies the recipient.</p>
            </section>
          </Panel>
        </div>

        {/* Rail last in the DOM so mobile reads the editor first; CSS lifts the card beside it and
            keeps it in view while you write. The card is the one lilac surface on this screen — it is
            where people's own words live — so everything around it stays white. Messages render
            exactly as stored, in a quote block with the shown name's initial. */}
        <div className="pn-rail">
          <section className="pn-card-preview pn-stack" aria-labelledby="card-preview-heading">
            <h2 id="card-preview-heading">{card.title}</h2>
            {card.pun && <p>{card.pun}</p>}
            {card.tagline && <p className="pn-muted">{card.tagline}</p>}
            {card.entries.length > 0 ? (
              <ul className="pn-list pn-list-tight" aria-label="Contributor messages">
                {card.entries.map((entry, index) => (
                  <li className="pn-stack pn-stack-sm" key={index}>
                    <div className="pn-row">
                      <span className="pn-avatar" aria-hidden="true">{shownName(entry).charAt(0)}</span>
                      <p className="pn-item-title">{shownName(entry)}</p>
                    </div>
                    <p className="pn-quote pn-quote-human">{entry.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No messages yet">Add your own message to start the card.</EmptyState>
            )}
          </section>
        </div>
      </div>
      <script src="/card-preview.js" defer />
    </Screen>
  );
}
