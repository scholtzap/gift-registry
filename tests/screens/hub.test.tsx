import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HubScreen } from '@/components/screens/hub';

const render = (props?: Parameters<typeof HubScreen>[0]) => renderToStaticMarkup(createElement(HubScreen, props));

it('keeps brand on the landing and privacy under the base path', () => {
  const html = render({ basePath: '/app' });
  expect(html).toMatch(/aria-label="Piñata home"[^>]*href="\/"|href="\/"[^>]*aria-label="Piñata home"/);
  expect(html).toContain('href="/app/privacy"');
  expect(html).toMatch(/class="pn-chrome-cta"[^>]*href="\/app"/);
});

describe('entry hub (CR-UX-01)', () => {
  it('offers create and open; proxy sits under More', () => {
    const html = render();
    expect(html).toContain('Create my circle');
    expect(html).toContain('Start a surprise circle');
    expect(html).toContain('More: surprise circle for someone else');
    expect(html).toContain('Open my circles');
    expect(html).toContain('Open with a code');
    expect(html).toContain('action="/app/create"');
    expect(html).toContain('href="/app/find"');
    expect(html).not.toContain('action="/app/find"');
    expect(html).not.toContain('open-my-circle');
    expect(html).toContain('href="/lookup"');
    // Brand returns to the landing; chrome My circles opens this hub.
    expect(html).not.toMatch(/pn-button-primary[^>]*href="\/app"/);
  });

  it('explains why the WhatsApp number is asked before the field', () => {
    const html = render();
    const why = html.indexOf('friends can join against it');
    const field = html.indexOf('name="phone"');
    expect(why).toBeGreaterThan(-1);
    expect(field).toBeGreaterThan(why);
    for (const name of ['name="name"', 'name="occasion"', 'name="eventDate"', 'name="email"', 'name="wish"']) {
      expect(html).toContain(name);
    }
  });

  it('prefixes actions with the deployment basePath', () => {
    const html = render({ basePath: '/app' });
    expect(html).toContain('action="/app/app/create"');
    expect(html).toContain('href="/app/app/find"');
    expect(html).toContain('href="/app/lookup"');
  });
});
