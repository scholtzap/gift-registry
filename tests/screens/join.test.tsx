import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JoinScreen, type JoinScreenProps } from '@/components/screens/join';

const privateData = {
  circleName: 'Private circle sentinel',
  shareSlug: 'private-share-slug-sentinel',
  ownerName: 'Private owner sentinel',
  memberCount: 9137,
  phone: 'Private phone sentinel',
  bsuid: 'Private identity sentinel',
  items: [{ title: 'Private gift sentinel', claimedBy: 'Private friend sentinel' }],
};

const render = (props: JoinScreenProps = {}) => renderToStaticMarkup(createElement(JoinScreen, props));

describe('JoinScreen public render boundary', () => {
  it('renders the native invite-list gate without reflecting any circle or friend data', () => {
    // Extra runtime props must not become markup, even if an adapter passes a projection by mistake.
    const props = { notice: undefined, ...privateData };
    const body = renderToStaticMarkup(createElement(JoinScreen, props));

    expect(body).toMatch(/<h1\b[^>]*>Join this circle<\/h1>/);
    expect(body).toMatch(/<form\b(?=[^>]*method="post")(?=[^>]*action="")[^>]*>/i);
    const name = body.match(/<input\b(?=[^>]*\bname="name")[^>]*>/i)?.[0];
    const phone = body.match(/<input\b(?=[^>]*\bname="phone")[^>]*>/i)?.[0];
    expect(name).toBeDefined();
    expect(name).toMatch(/\brequired(?:="")?(?:\s|\/?>)/i);
    expect(name).toMatch(/\bmaxlength="80"/i);
    expect(name).toMatch(/\bautocomplete="name"/i);
    expect(phone).toBeDefined();
    expect(phone).toMatch(/\btype="tel"/i);
    expect(phone).toMatch(/\bautocomplete="tel"/i);
    expect(phone).toMatch(/\brequired(?:="")?(?:\s|\/?>)/i);
    expect(phone).toMatch(/\bmaxlength="20"/i);
    for (const input of [name, phone]) {
      const id = input?.match(/\bid="([^"]+)"/)?.[1];
      const hintId = input?.match(/\baria-describedby="([^"]+)"/)?.[1];
      expect(id).toBeDefined();
      expect(body).toContain(`for="${id}"`);
      expect(hintId).toBeDefined();
      expect(body).toContain(`id="${hintId}"`);
    }
    expect(body).toMatch(/<button\b[^>]*type="submit"[^>]*>Continue<\/button>/i);
    expect(body).toMatch(/invite list/i);
    expect(body).toMatch(/full international form/i);
    expect(body).toMatch(/does not verify[^<]*number/i);
    expect(body).toContain('The person receiving the gift cannot see');
    expect(body).not.toMatch(/one.time (?:code|password)|send (?:you )?(?:an? )?(?:otp|code)|verified number/i);
    expect(body).not.toMatch(/name="(?:circle|slug|owner|member|item)[^"]*"|data-(?:circle|slug|owner|member)/i);
    for (const forbidden of [
      privateData.circleName,
      privateData.shareSlug,
      privateData.ownerName,
      String(privateData.memberCount),
      privateData.items[0]!.title,
      privateData.items[0]!.claimedBy,
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('renders identical public HTML even when private projection and identity props are supplied', () => {
    const props = { notice: undefined, ...privateData };
    const body = render(props);
    expect(body).toBe(render());
    expect(body).not.toMatch(/<input\b[^>]*(?:\bvalue=|\btype="hidden")/i);
    expect(body).not.toMatch(/\/c\/|data-(?:circle|slug|owner|member)|<script\b/i);
    expect(body).toContain('The person receiving the gift cannot see');
    expect(body).toContain('This does not verify that you control the number.');
    expect(body).not.toContain('role="alert"');
  });

  it('renders generic notices as escaped alert text, not executable markup', () => {
    const body = render({ notice: 'Try again <img src=x onerror=alert(1)> & "friends"' });
    expect(body).toContain('role="alert"');
    expect(body).toContain('Try again &lt;img src=x onerror=alert(1)&gt; &amp; &quot;friends&quot;');
    expect(body).not.toContain('<img src=x');
  });

  it('supports an explicit POST action without inventing a route or adding hidden state', () => {
    const body = render({ action: '/join?retry=1&from=gate' });
    expect(body).toMatch(/<form\b(?=[^>]*method="post")(?=[^>]*action="\/join\?retry=1&amp;from=gate")[^>]*>/i);
    expect(body).not.toMatch(/<input\b[^>]*type="hidden"/i);
  });
});

describe('JoinScreen rejection recovery (CR-UX-04)', () => {
  it('keeps typed name/number, shows what to check, and makes Ask to be added primary', () => {
    const body = render({ notice: 'We could not let you in with that number.', initialName: 'Typed Friend', initialPhone: '+999000000001', rejected: true });
    expect(body).toContain('What to check');
    expect(body).toContain('the number the organiser invited');
    expect(body).toContain('full international form');
    expect(body).toContain('value="Typed Friend"');
    expect(body).toContain('value="+999000000001"');
    // Ask to be added is the primary action on rejection; Continue drops to secondary.
    const ask = body.match(/<button\b[^>]*name="intent"[^>]*>[\s\S]*?<\/button>/i)?.[0] ?? '';
    expect(ask).toContain('pn-button-primary');
    expect(ask).toContain('Ask to be added');
    const cont = body.match(/<button\b[^>]*>[^<]*Continue<\/button>/i)?.[0] ?? '';
    expect(cont).toContain('pn-button-secondary');
    expect(body.indexOf('name="intent"')).toBeLessThan(body.indexOf('>Continue<'));
    // Generic privacy wording is unchanged.
    expect(body).toContain('We check the invite list. This does not verify that you control the number.');
    expect(body).toContain('We could not let you in with that number.');
  });

  it('without rejection, Continue stays primary and no recovery guidance shows', () => {
    const body = render();
    expect(body).not.toContain('What to check');
    const cont = body.match(/<button\b[^>]*>[^<]*Continue<\/button>/i)?.[0] ?? '';
    expect(cont).toContain('pn-button-primary');
  });
});
