import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CardComposerScreen,
  type CardComposerData,
} from '@/components/screens/card-composer';

const basePath = '/c/fictional-circle';
const cardPath = `${basePath}/items/fictional-gift/card`;
const card: CardComposerData = {
  itemId: 'fictional-gift',
  title: 'Trail flask',
  pun: 'Sip, sip, hooray!',
  tagline: 'For your next adventure.',
  entries: [
    {
      displayNameShown: 'Lumi',
      message: 'You & me <on the trail> — same words, always.',
      anonymous: false,
    },
    {
      displayNameShown: 'Hidden fictional name',
      message: 'stay wild.  really!\nSee you out there.',
      anonymous: true,
    },
  ],
  myEntry: {
    displayNameShown: 'Lumi',
    message: 'You & me <on the trail> — same words, always.',
    anonymous: false,
  },
};

function render(data: CardComposerData = card, notice?: string) {
  return renderToStaticMarkup(
    createElement(CardComposerScreen, { card: data, basePath, notice }),
  );
}

function forms(html: string) {
  return [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map((match) => match[0]);
}

describe('CardComposerScreen public render', () => {
  it('shows the item, optional card copy and contributor messages verbatim, without italics', () => {
    const html = render();
    expect(html).toContain('Trail flask');
    expect(html).toContain('Sip, sip, hooray!');
    expect(html).toContain('For your next adventure.');
    expect(html).toContain('You &amp; me &lt;on the trail&gt; — same words, always.');
    expect(html).toContain('stay wild.  really!\nSee you out there.');
    expect(html).not.toMatch(/<(?:i|em)\b|font-style:\s*italic|\bitalic\b/);
    expect(html).not.toContain('Hidden fictional name');
    expect(html).toContain('Anonymous');
    expect(html).toContain('pn-card-preview');
    expect(html).toContain('white-space:pre-wrap');
  });

  it('posts only your entry with the exact field names and native length limits', () => {
    const html = render();
    const renderedForms = forms(html);
    expect(renderedForms).toHaveLength(3);
    const pun = renderedForms.find((form) => form.includes('value="pun"'));
    expect(pun).toBeDefined();
    expect(pun).toContain(`action="${cardPath}"`);
    expect(pun).not.toMatch(/name="(?:displayNameShown|message|userId|contributorId)"/);
    const save = renderedForms.find((form) => form.includes('value="save_entry"'));
    expect(save).toBeDefined();
    expect(save).toContain(`action="${cardPath}"`);
    expect(save).toContain('method="post"');
    expect(save).toMatch(/<input\b(?=[^>]*name="intent")(?=[^>]*value="save_entry")[^>]*>/);
    expect(save).toMatch(/<input\b(?=[^>]*name="displayNameShown")(?=[^>]*maxLength="80")[^>]*>/);
    expect(save).toMatch(/<textarea\b(?=[^>]*name="message")(?=[^>]*maxLength="200")[^>]*>/);
    expect(save).toMatch(/<input\b(?=[^>]*type="checkbox")(?=[^>]*name="anonymous")[^>]*>/);
    expect(save).toContain('value="Lumi"');
    expect(save).toContain('You &amp; me &lt;on the trail&gt; — same words, always.');
    expect(save).not.toContain('stay wild.');
    expect(save).not.toMatch(/name="(?:userId|contributorId|contributorUserId|amount|amountMinor)"/);
  });

  it('provides labelled controls, an own-message preview and an explicit anonymous opt-out', () => {
    const html = render();
    const nameInput = html.match(/<input\b(?=[^>]*name="displayNameShown")[^>]*>/)?.[0];
    const nameId = nameInput?.match(/\bid="([^"]+)"/)?.[1];
    expect(nameId).toBeDefined();
    expect(html).toContain(`for="${nameId}"`);
    expect(html).toContain('for="card-message"');
    expect(html).toContain('for="card-anonymous"');
    expect(html).toContain('id="card-message"');
    expect(html).toContain('id="card-anonymous"');
    expect(html).toContain('Your contribution to the card');
    expect(html).toContain('aria-describedby="card-message-help"');
    expect(html).toContain('aria-describedby="card-anonymous-help"');
    expect(html).toContain('Your message preview');
    expect(html).toContain('Edit only your own message');
    expect(html).toContain('leave your name off the card');
    expect(html).toContain('Your message will still appear');
    expect(html).toContain('200 characters');
    expect(html).toContain('No links');
  });

  it('separates explicit PNG generation from saving and offers a manual download', () => {
    const html = render();
    const generate = forms(html).find((form) => form.includes('value="render"'));
    expect(generate).toBeDefined();
    expect(generate).toContain(`action="${cardPath}"`);
    expect(generate).toContain('method="post"');
    expect(generate).toMatch(/<input\b[^>]*name="intent"[^>]*value="render"/);
    expect(generate).not.toMatch(/name="(?:message|displayNameShown|anonymous)"/);
    expect(html).toMatch(new RegExp(`<a\\b[^>]*href="${cardPath}/png"[^>]*download(?:="[^"]*")?`));
    expect(html).toContain('Generate PNG');
    expect(html).toContain('Download PNG');
    expect(html).toContain('Share or print it yourself');
    expect(html).not.toMatch(/<(?:button|a)\b[^>]*>[^<]*(?:send|deliver|notify|publish)/i);
    expect(html).not.toMatch(/og:|property="og|twitter:|navigator\.share|whatsapp:|wa\.me|autofocus/i);
  });

  it('never renders ledger amounts, payment controls or an online owner view', () => {
    const withLedgerExtras = {
      ...card,
      amountMinor: 987654,
      currency: 'ZAR',
      entries: card.entries.map((entry) => ({ ...entry, amountMinor: 123456 })),
    };
    const html = render(withLedgerExtras);
    expect(html).not.toMatch(/987654|123456|ZAR|\bR\s*\d|\$\d|amount|pledged|paid|settled|payment/i);
    expect(html).not.toMatch(/owner (?:can|will) (?:view|see)|recipient (?:can|will) (?:view|see)|view (?:it|the card) online/i);
  });

  it('handles a first entry and a plain card without inventing contributor messages or model copy', () => {
    const html = render({ ...card, entries: [], myEntry: null, pun: null, tagline: null });
    expect(html).toContain('No messages yet');
    expect(html).toContain('Add your own message');
    expect(html).toMatch(/name="displayNameShown"[^>]*value=""/);
    expect(html).toMatch(/<textarea\b[^>]*name="message"[^>]*><\/textarea>/);
    expect(html).not.toContain('Sip, sip, hooray!');
    expect(html).not.toContain('For your next adventure.');
    expect(html).not.toContain('Lumi');
    expect(html).not.toMatch(/\bnull\b|\bundefined\b/);
  });

  it('prefills your anonymous choice and announces escaped notices', () => {
    const html = render(
      { ...card, myEntry: { displayNameShown: 'Lumi', message: 'Keep exploring.', anonymous: true } },
      'Saved <exactly> & safely.',
    );
    expect(html).toMatch(/<input\b[^>]*name="anonymous"[^>]*checked=""/);
    expect(html).toContain('role="status"');
    expect(html).toContain('Saved &lt;exactly&gt; &amp; safely.');
    expect(html).not.toContain('Saved <exactly>');
  });

  it('treats contributor text as plain text, never executable markup', () => {
    const html = render({
      ...card,
      entries: [{ displayNameShown: '<b>Fictional</b>', message: '<script>alert("gift")</script>', anonymous: false }],
    });
    expect(html).toContain('&lt;b&gt;Fictional&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;gift&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Fictional</b>');
  });
});
