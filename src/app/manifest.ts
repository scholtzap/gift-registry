import type { MetadataRoute } from 'next';

/**
 * The web app manifest. Next serves this at `/manifest.webmanifest` and links it from every
 * App Router document; the raw `/c/<slug>` shell cannot use the metadata API, so
 * `src/server/routes/circle.ts` links the same URL by hand. One file, two shells, no drift.
 *
 * Public brand metadata only — the same rule as `layout.tsx`. Nothing here may name a circle,
 * a person or an amount, and `start_url` deliberately points at the public invite entry rather
 * than at a circle, because a manifest is readable by anyone who guesses the origin.
 *
 * The colours are the V8 tokens: the shell is light-only (`--pn-bg: #ffffff`), so the splash
 * and the OS bar get white rather than the indigo of the icon artwork.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Piñata',
    short_name: 'Piñata',
    description: 'Group gifts nobody can spoil. One wishlist link in your WhatsApp group.',
    id: '/',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    lang: 'en-ZA',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
