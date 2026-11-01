/**
 * The shared HTML shell for every framework-free route response (`/c/<slug>`,
 * `/lookup`). Static brand metadata only, byte-identical for every role: the
 * documents are `private, no-store`, so anything per-person belongs in the
 * body, never in this shell. Extracted from circle.ts (CR-UX-02) so the
 * lookup/proxy creation flow renders in the same shell as the circle screens.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/**
 * Defense in depth behind React SSR escaping + `escapeHtml` + card validation:
 * no inline scripts or styles are used (styling is `/pinata.css`, photos and
 * card art are same-origin), so the policy can stay tight. `img-src data:`
 * covers client-side previews before upload; nothing else needs it.
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' https://challenges.cloudflare.com; object-src 'none'; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'";

const ASSET_BASE = process.env.PINATA_BASE_PATH ?? "";

export function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#ffffff">
<meta name="application-name" content="Piñata">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Piñata">
<link rel="icon" href="${ASSET_BASE}/icon.png">
<link rel="apple-touch-icon" href="${ASSET_BASE}/apple-icon.png">
<link rel="manifest" href="${ASSET_BASE}/manifest.webmanifest">
<link rel="stylesheet" href="${ASSET_BASE}/pinata.css">
<script src="${ASSET_BASE}/register-sw.js" defer></script>
<title>${escapeHtml(title)} · Piñata</title></head>
<body>
${body}</body></html>`;
}
