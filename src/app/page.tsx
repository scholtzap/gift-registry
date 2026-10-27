import { LandingScreen } from '@/components/screens/landing';

export const dynamic = 'force-static';
export const revalidate = 300;

export default function LandingPage() {
  return <LandingScreen />;
}
