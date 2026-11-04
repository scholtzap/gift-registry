import { cookies } from 'next/headers';
import { DashboardScreen } from '@/components/screens/dashboard';
import { HubScreen } from '@/components/screens/hub';
import { readSession, SESSION_COOKIE } from '@/server/auth/session';
import { getAppDb } from '@/server/db/client';
import { loadDashboard } from '@/server/views/dashboard';

/** Signed-out: create and find. Signed-in: the circles dashboard, not another create form. */
export const dynamic = 'force-dynamic';

export default async function AppEntryPage() {
  const basePath = process.env.PINATA_BASE_PATH ?? '';
  const jar = await cookies();
  const session = readSession(jar.get(SESSION_COOKIE)?.value);
  if (session) {
    const view = await loadDashboard(getAppDb(), session);
    if (view) return <DashboardScreen view={view} basePath={basePath} />;
  }
  return <HubScreen basePath={basePath} />;
}
