import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { LandingScreen } from '@/components/screens/landing';
import LandingPage, { dynamic, revalidate } from '@/app/page';

// Public rendering must work without identity, a database, or request state.
vi.mock('@/server/db/client', () => {
  throw new Error('The public landing must not load the database');
});
vi.mock('@/server/auth/session', () => {
  throw new Error('The public landing must not load actor sessions');
});
vi.mock('next/headers', () => {
  throw new Error('The public landing must not read request state');
});

const renderLanding = () => renderToStaticMarkup(createElement(LandingScreen));
const sourceAt = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

function importsOf(source: string) {
  const file = ts.createSourceFile('public.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return file.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
}

function textOf(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('the public Piñata landing', () => {
  it('pins one primary app CTA and offers no private circle or card links', () => {
    const html = renderLanding();
    const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const appLinks = anchors.filter((anchor) => anchor[1] === '/app');
    expect(appLinks).toHaveLength(1);
    expect(textOf(appLinks[0]![2]!)).toBe('Open Piñata');
    expect(appLinks[0]![0]).toContain('pn-button-primary');
    expect(anchors.map((anchor) => anchor[1])).toEqual(['#pn-content', '/', '/app', '#how-it-works']);
    expect(html).not.toMatch(/(?:href|src)="(?:https?:|\/c\/|\/cards?\/|\/api\/)/);
  });

  it('explains the voice, confirmation, friends, and human-share story in order', () => {
    const text = textOf(renderLanding());
    expect(text).toContain('Group gifts. Surprise intact.');
    const steps = ['Say it. Then confirm it.', 'Friends coordinate.', 'Share the card yourself.'];
    const positions = steps.map((step) => text.indexOf(step));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(text).toContain('voice note');
    expect(text).toContain('WhatsApp group');
    expect(text).toContain('never sends the card');
    expect(text).toContain('The gift recipient sees their wishlist, not who has claimed or pooled.');
  });

  it('labels its small fictional preview instead of presenting live activity', () => {
    const html = renderLanding();
    expect(html).toContain('aria-labelledby="landing-example-title"');
    expect(html).toContain('id="landing-example-title"');
    const text = textOf(html);
    const example = html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/);
    expect(example).not.toBeNull();
    expect(textOf(example![1]!)).toBe(
      'Example Illustration Fictional illustration, not a live circle. ' +
      'A wish, in your words A picnic blanket “Something for slow afternoons in the park.” ' +
      'A card, shared by a friend For the next sunny afternoon. The message and the moment are yours.',
    );
    expect(html).not.toMatch(/data-(?:circle|user|actor|contributor)|circleId|shareSlug|userId|\+\d{8,}/);
    // The seeded demo circle and cast are the concrete leak this guards: none of their
    // identifiers or names may ever reach the public page.
    expect(html).not.toContain('nadia-30th');
    expect(html).not.toMatch(/Nadia|Thabo|Lerato|Sibusiso|Petersen|Mokoena|Dube|Khumalo/);
    expect(text).not.toMatch(/\b(?:R\s*\d|ZAR|USD|GBP|pledged|funded|remaining|contributors?|testimonials?|certified|GDPR|POPIA)\b/i);
    expect(html).not.toMatch(/<form\b|<input\b|<iframe\b|<video\b/);
  });

  it('renders deterministically with no props or actor context', () => {
    expect(LandingScreen.length).toBe(0);
    expect(renderLanding()).toBe(renderLanding());
    expect(renderToStaticMarkup(createElement(LandingPage))).toBe(renderLanding());
    expect(dynamic).toBe('force-static');
    expect(revalidate).toBe(300);
  });

  it('keeps the page adapter and screen imports restricted to the public UI', () => {
    const screen = sourceAt('../../src/components/screens/landing.tsx');
    const page = sourceAt('../../src/app/page.tsx');
    expect(importsOf(screen)).toEqual(['@/components/ui']);
    expect(importsOf(page)).toEqual(['@/components/screens/landing']);
    for (const source of [screen, page]) {
      expect(source).not.toMatch(/\b(?:cookies|headers|fetch|withActor|readSession|prisma|process)\b|import\s*\(|require\s*\(/);
      expect(source).not.toMatch(/['"]use client['"]|\basync\b/);
    }
  });

  it('uses native landmarks, a clear heading sequence, and the supplied mark', () => {
    const html = renderLanding();
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('<ol');
    expect(html).toContain('id="how-it-works"');
    expect(html).toContain('aria-labelledby="landing-story-title"');
    expect(html).toMatch(/<img\b[^>]*src="\/icon.png"[^>]*alt=""/);
    expect(html.match(/<img\b/g)).toHaveLength(4);
    for (const shot of ['owner-ledger', 'friend-ledger', 'gift-card']) {
      expect(html).toContain(`src="/screenshots/${shot}.png"`);
    }
    expect(html.match(/<header\b/g)).toHaveLength(1);
    expect(html.match(/<footer\b/g)).toHaveLength(1);
    expect(html).toContain('href="#pn-content"');
    expect(html).toMatch(/<main\b[^>]*id="pn-content"[^>]*tabindex="-1"/);
    expect(html).toContain('pn-hero');
    expect(html).toContain('pn-card-preview');
    expect(html).not.toMatch(/role="button"|tabindex="[1-9]\d*"|<h[4-6]\b/);
  });
});
