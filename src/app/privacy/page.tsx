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
    <Screen title="Privacy notice" eyebrow="Last updated 4 November 2026" backHref="/" backLabel="Piñata home" privacyHref={`${base}/privacy`}>
      <div className="pn-stack pn-measure">
        <Panel className="pn-stack">
          <p>
            This notice covers the Piñata app and the site at <a href="https://gifts.scholtz.work/">gifts.scholtz.work</a>.
            Piñata is a group gift list you use in the browser: one person keeps a wish list, shares one
            circle link with their group, and friends plan who buys what without the list owner seeing it.
          </p>
        </Panel>

        <Panel className="pn-stack">
          <h2>What we collect</h2>
          <p><strong>About you:</strong> the name you want on gift cards, the email or phone you use to
            log in to your circles dashboard, and the WhatsApp number friends join against. Numbers on a
            circle&apos;s invite list are stored only as a keyed hash.</p>
          <p><strong>Gift lists:</strong> wishes, prices, shop names, product photos, and the sizes and
            favourites the list owner chooses to share with friends.</p>
          <p><strong>Friends&apos; plans:</strong> who claimed or is buying each gift, pools, pledges,
            &quot;paid&quot; marks, bank details a buyer chooses to share with pledgers, secret gift ideas
            and card messages.</p>
          <p><strong>Product photos:</strong> a photo you attach to a gift in the browser. We save a
            resized copy and remove its location, camera and other metadata first.</p>
          <p><strong>Optional WhatsApp intake:</strong> if you message the Piñata WhatsApp number, we
            store the voice notes, screenshots or links you send so they can become a draft you check
            before anything is added. You can switch each of those features off in Settings.</p>
          <p><strong>Contact form:</strong> your email, your message, your name if you add it, and the
            time you sent it.</p>
        </Panel>

        <Panel className="pn-stack">
          <h2>Who can see it</h2>
          <p>The list owner sees their own wishes, sizes and photos. They do not see claims, pools,
            pledges, who is buying what, secret ideas, card messages or photos friends add to those ideas.</p>
          <p>Friends in a circle see the wishes, the shared sizes, who is buying each gift, pool progress,
            each other&apos;s plans and the photos on gifts they can see. People outside the circle see nothing.</p>
          <p>We do not sell this data and we do not show ads.</p>
        </Panel>

        <Panel className="pn-stack">
          <h2>Who processes it for us</h2>
          <p>The app runs on our own host. Circle data and photos are kept in our own database and file storage.</p>
          <p>Sign-in uses a short email code. The session cookie is HttpOnly and SameSite=Lax.</p>
          <p>If you use optional WhatsApp intake, those messages travel through Meta&apos;s WhatsApp
            Business Platform. When you leave an AI setting on, Meta&apos;s models may read the voice note,
            image or link to draft a gift. Switch a setting off in the app and that path stops for you.</p>
          <p>The website is hosted on Cloudflare. Contact form messages are emailed through Resend.</p>
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
