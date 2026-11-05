import { getAppDb } from '@/server/db/client';
import { handleDashboardPost } from '@/server/routes/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleDashboardPost(getAppDb(), request);
}
