import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Manrope, Space_Grotesk, Syne } from 'next/font/google';
import './globals.css';

const syne = Syne({ subsets: ['latin'], weight: ['700'], variable: '--font-syne', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-manrope', display: 'swap' });
const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Piñata', template: '%s · Piñata' },
  description: 'Group gifts nobody can spoil.',
  applicationName: 'Piñata',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${manrope.variable} ${grotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
