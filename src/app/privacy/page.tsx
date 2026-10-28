import type { Metadata } from 'next';
import { Panel, Screen } from '@/components/ui';

// Public page: no session, no circle, no data. Structure follows the shared scholtz.work privacy
// pattern (skill `scholtz-site-footer`); the facts are Piñata's own. Update the date with any change.
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Privacy notice',
  description: 'What Piñata stores, who can see it, and how to have it removed.',
};

const CONTACT = 'https://gifts.scholtz.work/#contact';

export default function PrivacyPage() {
  const base = process.env.PINATA_BASE_PATH ?? '';
  return (
    <Screen title="Privacy notice" eyebrow="Last updated 27 October 2026" backHref={`${base}/app`} backLabel="Piñata home" homeHref={`${base}/app`} privacyHref={`${base}/privacy`}>
      <div className="pn-stack pn-measure">
        <Panel className="pn-stack">
          <p>
            This notice covers the Piñata app and the site at <a href="https://gifts.scholtz.work/">gifts.scholtz.work</a>.
            Piñata is a group gift list: one person keeps a wish list, and their friends plan who buys
            what without the list owner seeing it.
          </p>
        </Panel>

        <Panel className="pn-stack">
          <h2>What we collect</h2>
          <p><strong>About you:</strong> the name you want on gift cards, and the WhatsApp number you
            join with. Numbers on a circle&apos;s invite list are stored only as a keyed hash.</p>
          <p><strong>Gift lists:</strong> wishes, prices, shop names, and the sizes and favourites the
            list owner chooses to share with friends.</p>
          <p><strong>Friends&apos; plans:</strong> claims, pools, pledges, &quot;paid&quot; marks, secret
            gift ideas and card messages.</p>
          <p><strong>Product photos:</strong> a photo you attach to a gift. We save a resized copy and
            remove its location, camera and other metadata first.</p>
          <p><strong>Messages to the Piñata WhatsApp number:</strong> voice notes, screenshots and
            links you send, so we can turn them into a draft you check before anything is added.</p>
          <p><strong>Contact form:</strong> your email, message and the time you sent it.</p>
        </Panel>

        <Panel className="pn-stack">
          <h2>Who can see it</h2>
          <p>The list owner sees their own wishes, sizes and photos. They do not see claims, pools,
            pledges, secret ideas, card messages or photos friends add to those ideas.</p>
          <p>Friends in a circle see the wishes, the shared sizes, each other&apos;s plans and the
            photos on gifts they can see. People outside the circle see nothing.</p>
          <p>We do not sell this data and we do not show ads.</p>
        </Panel>

        <Panel className="pn-stack">
          <h2>Who processes it for us</h2>
          <p>WhatsApp messages travel through Meta&apos;s WhatsApp Business Platform. When you leave an
            AI setting on, Meta&apos;s models read the voice note, image or link to draft a gift; you can
            switch each one off under Settings, and then nothing is sent to them.</p>
          <p>The website is hosted on Cloudflare. Circle data and photos are kept in our own database
            and file storage.</p>
        </Panel>

        <Panel className="pn-stack">
          <h2>Keeping and removing it</h2>
          <p>We keep circle data and photos until you ask us to remove them. Ask through the{' '}
            <a href={CONTACT}>contact form</a> and we will delete your details and the photos you added.
            Card messages and pledges other people wrote stay with them.</p>
          <p>South African users also have rights under POPIA. Send any request through the contact
            form and we will reply within a reasonable time.</p>
        </Panel>

        <Panel className="pn-stack">
          <h2>Contact</h2>
          <p>Use the <a href={CONTACT}>contact form on gifts.scholtz.work</a>.</p>
        </Panel>
      </div>
    </Screen>
  );
}
