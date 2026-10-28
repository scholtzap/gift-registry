import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

// Public brand metadata only. Never inherit gift or contributor content into previews.
export const metadata: Metadata = {
  title: { default: 'Piñata', template: '%s · Piñata' },
  description: 'Group gifts nobody can spoil.',
  applicationName: 'Piñata',
  referrer: 'no-referrer',
  // Next links /manifest.webmanifest (generated from src/app/manifest.ts) and these tags cover
  // iOS Safari, which still decides "Add to Home Screen" behaviour from them.
  appleWebApp: { capable: true, title: 'Piñata', statusBarStyle: 'default' },
};

// viewport-fit=cover is what makes the `env(safe-area-inset-bottom)` padding on the tab bar and
// the sticky action bar resolve to a real number on a notched phone instead of zero.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fbf5ec',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href={`${process.env.PINATA_BASE_PATH ?? ''}/pinata.css`} />
        <script src={`${process.env.PINATA_BASE_PATH ?? ''}/register-sw.js`} defer />
      </head>
      <body>{children}</body>
    </html>
  );
}
