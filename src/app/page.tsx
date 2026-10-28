import { LandingScreen } from '@/components/screens/landing';

export const dynamic = 'force-static';
export const revalidate = 300;

export default function LandingPage() {
  // Hub is the Next /app route: /app in dev, /app/app under the production
  // PINATA_BASE_PATH=/app — so the landing CTA never links to itself (CR-UX-01).
  return <LandingScreen hubHref={`${process.env.PINATA_BASE_PATH ?? ''}/app`} assetBase={process.env.PINATA_BASE_PATH ?? ''} demo={process.env.DEMO_MODE === 'on'} />;
}
