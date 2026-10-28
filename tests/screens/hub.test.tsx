import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HubScreen } from '@/components/screens/hub';

const render = (props?: Parameters<typeof HubScreen>[0]) => renderToStaticMarkup(createElement(HubScreen, props));

describe('entry hub (CR-UX-01)', () => {
  it('offers create, proxy and open on one screen with no self-link', () => {
    const html = render();
    expect(html).toContain('Create my circle');
    expect(html).toContain('Start a circle for someone');
    expect(html).toContain('Open my circle');
    expect(html).toContain('action="/app/create"');
    expect(html).toContain('action="/app/open"');
    expect(html).toContain('href="/lookup"');
    expect(html).not.toContain('href="/app"');
    // The hub itself is /app, so no primary button may reload it.
    expect(html).not.toMatch(/pn-button-primary[^>]*href="\/app"/);
  });

  it('explains why the WhatsApp number is asked before the field', () => {
    const html = render();
    const why = html.indexOf('friends can join against it');
    const field = html.indexOf('name="phone"');
    expect(why).toBeGreaterThan(-1);
    expect(field).toBeGreaterThan(why);
    for (const name of ['name="name"', 'name="occasion"', 'name="eventDate"', 'name="wish"']) {
      expect(html).toContain(name);
    }
  });

  it('prefixes actions with the deployment basePath', () => {
    const html = render({ basePath: '/app' });
    expect(html).toContain('action="/app/app/create"');
    expect(html).toContain('action="/app/app/open"');
    expect(html).toContain('href="/app/lookup"');
  });
});
