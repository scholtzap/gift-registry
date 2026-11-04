import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/**
 * The pinata.scholtz.work proxy contract: Caddy v2 `path` patterns match
 * exactly unless they end in `*`. The entry-hub forms POST to /app/create and
 * /app/open, so the @app matcher must cover /app/* — an exact `/app` alone
 * lets those POSTs fall through to the static file server, which answers 404
 * (seen live 2026-10-28: "No web page was found for ... /app/create").
 */
function loadAppPatterns(): string[] {
  const caddyfile = readFileSync('docs/deployment/Caddyfile.pinata', 'utf8');
  const line = caddyfile.split('\n').find((l) => l.trimStart().startsWith('@app path'));
  if (!line) throw new Error('@app matcher line missing from Caddyfile.pinata');
  return line.trim().split(/\s+/).slice(2);
}

function matches(pattern: string, path: string): boolean {
  return pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
}

function routesToApp(patterns: string[], path: string): boolean {
  return patterns.some((p) => matches(p, path));
}

it('proxies every hub URL to Next, never to the static file server', () => {
  const patterns = loadAppPatterns();
  for (const path of ['/app', '/app/create', '/app/open']) {
    expect(routesToApp(patterns, path), `${path} must reach Next`).toBe(true);
  }
});

it('keeps the static landing surface off the proxy', () => {
  const patterns = loadAppPatterns();
  for (const path of ['/', '/guide']) {
    expect(routesToApp(patterns, path), `${path} must stay on the static site`).toBe(false);
  }
});

it('proxies the remaining Next surfaces (circles, lookup, api, health, assets)', () => {
  const patterns = loadAppPatterns();
  for (const path of [
    '/c/nadia-30th',
    '/lookup',
    '/privacy',
    '/offline',
    '/health',
    '/llms.txt',
    '/card-preview.js',
    '/icons/icon-192.png',
    '/api/wa/webhook',
    '/_next/static/x.js',
  ]) {
    expect(routesToApp(patterns, path), `${path} must reach Next`).toBe(true);
  }
});
