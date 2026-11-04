import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const site = (name: string) => readFileSync(join(process.cwd(), 'site/public', name), 'utf8');

describe('site copy alignment (CR-UX-06)', () => {
  it('points the secondary hero CTA at login, not contact', () => {
    const html = site('index.html');
    expect(html).toContain('My circles');
    expect(html).toContain('https://pinata.scholtz.work/app/find');
    expect(html).not.toContain('#open-my-circle');
    expect(html).not.toContain('or get in touch');
    expect(html).not.toContain('The demo app is open.');
    expect(html).not.toContain('It opens from the link in your WhatsApp group.');
    expect(html).not.toContain('Prefer email?');
  });

  it('guide owner step 1 describes creating a circle in the app', () => {
    const html = site('guide.html');
    expect(html).toContain('Create your circle in the app.');
    expect(html).toContain('Create my circle');
    expect(html).toContain('your WhatsApp number so friends can join against it');
    expect(html).toContain('Share this link');
    expect(html).toContain('Add wishes in the browser.');
    expect(html).not.toContain('Sign up on the home page and we email it to you');
    expect(html).not.toContain('Get your setup link.');
    expect(html).not.toContain('AI, and turning it off');
  });

  it('merges how-it-works and guide into one web telling on the site', () => {
    const html = site('index.html');
    expect(html).toContain('id="how-it-works"');
    expect(html).toContain('You pick the wishes. Your friends plan the rest.');
    expect(html).toContain('Everything happens in the browser.');
    expect(html).toContain('Read the owner guide');
    expect(html).not.toContain('id="guide"');
    expect(html).not.toContain('Does the AI decide anything?');
    expect(html).toContain('How do friends join?');
  });

  it('privacy notice matches the browser-first product and buyer visibility', () => {
    const html = site('privacy.html');
    expect(html).toContain('you use in the browser');
    expect(html).toContain('shares one circle link');
    expect(html).toContain('who claimed or is buying each gift');
    expect(html).toContain('who is buying each gift');
    expect(html).toContain('https://pinata.scholtz.work/app/find');
    expect(html).toContain('My circles');
    expect(html).toContain('Optional WhatsApp intake');
    expect(html).not.toContain('Prefer email?');
  });
});

