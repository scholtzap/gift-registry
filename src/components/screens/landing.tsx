import { Badge, Cta, Panel, Screen } from '@/components/ui';

// Public projection: authored copy only; no circle, actor, or card data.
export function LandingScreen({ hubHref = '/app', demo = false, assetBase = '' }: { hubHref?: string; demo?: boolean; assetBase?: string } = {}) {
  const appBase = hubHref.replace(/\/app$/, '');
  return (
    <Screen homeHref={hubHref} privacyHref={`${appBase}/privacy`}>
      <div className="pn-hero pn-grid">
        <div className="pn-stack">
          {demo && <Badge>Demo</Badge>}
          <p className="pn-eyebrow">Group gifts nobody can spoil</p>
          <h1>
            Group gifts.<br />Surprise intact.
          </h1>
          <p className="pn-lede">
            Tell your friends what you’d like and still get a surprise.
            They see who is buying what; you don’t.
          </p>
          <p className="pn-muted">
            One wishlist link in your WhatsApp group. Friends plan the gift;
            you find out when they hand it over.
          </p>
          <div className="pn-actions">
            <a className="pn-button pn-button-primary" href={hubHref}>Start your circle</a>
            <Cta href={`${hubHref}#open-my-circle`}>Open my circle</Cta>
          </div>
        </div>

        <aside className="pn-measure" aria-labelledby="landing-example-title">
          <Panel className="pn-card-preview pn-stack">
            <div className="pn-row pn-between">
              <h2 id="landing-example-title">Example</h2>
              <Badge>Illustration</Badge>
            </div>
            <p className="pn-small pn-muted">Fictional illustration, not a live circle.</p>
            <div className="pn-stack pn-stack-sm">
              <p className="pn-eyebrow">A wish, in your words</p>
              <p>A picnic blanket</p>
              <p className="pn-quote pn-quote-human">“Something for slow afternoons in the park.”</p>
            </div>
            <div className="pn-stack pn-stack-sm">
              <p className="pn-eyebrow">A card, shared by a friend</p>
              <p className="pn-quote pn-quote-human">For the next sunny afternoon.</p>
            </div>
          </Panel>
        </aside>
      </div>

      <section className="pn-stack" aria-labelledby="landing-strip-title">
        <div className="pn-stack">
          <p className="pn-eyebrow">The product, as seeded</p>
          <h2 id="landing-strip-title">Screenshots from the fictional demo cast</h2>
          <p className="pn-small pn-muted">Captured from the seeded demo. No live circle is shown.</p>
        </div>
        <div className="pn-grid pn-grid-3">
          <img src={`${assetBase}/screenshots/owner-ledger.png`} alt="The recipient's wishlist view, with no sign of claims or pools" loading="lazy" />
          <img src={`${assetBase}/screenshots/friend-ledger.png`} alt="The friends' planning view of the same circle" loading="lazy" />
          <img src={`${assetBase}/screenshots/gift-card.png`} alt="The group gift card friends hand over themselves" loading="lazy" />
        </div>
      </section>

      <Panel as="section" className="pn-stack">
        <p>The gift recipient sees their wishlist, not who has claimed or pooled.</p>
      </Panel>
    </Screen>
  );
}
