import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, Brand, Button, Field, Panel, Screen } from '../../src/components/ui';

describe('Piñata shared public render', () => {
  it('renders a branded, labelled contribution form without rewriting its content', () => {
    const message = 'Keep the weird little dash — it is mine. <3';
    const html = renderToStaticMarkup(
      <Screen title="Join the gift" eyebrow="Friends only" backHref="/c/party" backLabel="Back to the circle">
        <Panel className="pn-stack">
          <Badge tone="open">Not yet claimed</Badge>
          <form action="/contribute" method="post">
            <Field label="Your contribution" name="amount" id="contribution-amount" type="number" defaultValue="150" required min="1" step="1" hint="Amount in rand. No payment is taken here." />
            <Field label="Card message" name="message" id="contribution-message" defaultValue={message} maxLength={200} placeholder="Your own words" />
            <Button type="submit">Pledge R150</Button>
            <Button variant="secondary" disabled>Mark paid</Button>
          </form>
          <p>{message}</p>
        </Panel>
      </Screen>,
    );

    expect(html).toContain('Piñata');
    expect(html).toMatch(/<img[^>]*src="\/icon\.png"[^>]*alt=""/);
    expect(html).toMatch(/<a[^>]*href="#pn-content"[^>]*>Skip to content<\/a>/);
    expect(html).toMatch(/<main[^>]*id="pn-content"/);
    expect(html).toMatch(/<h1[^>]*>Join the gift<\/h1>/);
    expect(html).toMatch(/<a[^>]*href="\/c\/party"[^>]*>[\s\S]*?Back to the circle<\/a>/);
    expect(html).toContain('class="pn-panel pn-stack"');
    expect(html).toContain('Not yet claimed');
    const input = html.match(/<input\b[^>]*name="amount"[^>]*>/)?.[0];
    expect(input).toBeDefined();
    const id = input!.match(/\bid="([^"]+)"/)?.[1];
    const hintId = input!.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(hintId).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain(`id="${hintId}"`);
    expect(input).toContain('required=""');
    expect(input).toContain('min="1"');
    expect(input).toContain('step="1"');
    expect(input).toContain('value="150"');
    expect(html).toContain('maxLength="200"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Pledge R150<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Mark paid<\/button>/);
    expect(html).toContain('Keep the weird little dash — it is mine. &lt;3');
    expect(html).not.toContain('og:');
  });

  it('keeps the brand public and does not make ordinary buttons submit a form', () => {
    const html = renderToStaticMarkup(<><Brand /><Button>Choose a gift</Button><Button variant="quiet">Cancel</Button></>);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*aria-label="Piñata home"/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Choose a gift<\/button>/);
    expect(html).toContain('pn-button-quiet');
  });

  it('points brand and privacy at the app surface under its base path (CR-UX-05)', () => {
    const html = renderToStaticMarkup(
      <Screen homeHref="/app/app" privacyHref="/app/privacy"><Panel>Hi</Panel></Screen>,
    );
    expect(html).toMatch(/<a[^>]*href="\/app\/app"[^>]*aria-label="Piñata home"/);
    expect(html).toMatch(/<a[^>]*href="\/app\/privacy"[^>]*>Privacy notice<\/a>/);
    expect(html).not.toMatch(/<a[^>]*href="\/"[^>]*aria-label="Piñata home"/);
  });

  it('supports untitled screens and ReactNode labels without duplicate input IDs', () => {
    const html = renderToStaticMarkup(
      <Screen>
        <Field label={<strong>Your name</strong>} name="name" id="first-name" />
        <Field label="Another name" name="name" id="second-name" />
        <Badge tone="done">Purchased</Badge>
        <Badge tone="money">Pooled</Badge>
        <Badge tone="human">You</Badge>
        <Badge>Draft</Badge>
      </Screen>,
    );
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('aria-describedby');
    expect(html).toContain('<strong>Your name</strong>');
    const ids = [...html.matchAll(/<input\b[^>]*id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`for="${id}"`);
    for (const status of ['Purchased', 'Pooled', 'You', 'Draft']) expect(html).toContain(status);
  });
});
