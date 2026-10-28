import { HubScreen } from '@/components/screens/hub';

/** CR-UX-01: the one entry door. The old "use your invitation link" dead end folds into here. */
export default function AppEntryPage() {
  return <HubScreen basePath={process.env.PINATA_BASE_PATH ?? ''} />;
}
