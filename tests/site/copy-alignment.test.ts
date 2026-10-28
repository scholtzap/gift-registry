import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const site = (name: string) => readFileSync(join(process.cwd(), 'site/public', name), 'utf8');

describe('site copy alignment (CR-UX-06)', () => {
  it('qualifies the hero as a demo instead of simply live', () => {
    const html = site('index.html');
    expect(html).toContain('The demo app is open.');
    expect(html).not.toContain('The app is live.');
  });

  it('guide owner step 1 describes creating a circle in the app', () => {
    const html = site('guide.html');
    expect(html).toContain('Create your circle in the app.');
    expect(html).toContain('Create my circle');
    expect(html).toContain('your WhatsApp number so friends can join against it');
    expect(html).not.toContain('Sign up on the home page and we email it to you');
    expect(html).not.toContain('Get your setup link.');
  });

  it('keeps the single how-it-works telling on the site', () => {
    expect(site('index.html')).toContain('id="how-it-works"');
    expect(site('index.html')).toContain('You pick the wishes. Your friends plan the rest.');
  });
});
