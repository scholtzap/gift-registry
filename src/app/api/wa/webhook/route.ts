import { getAppDb } from '@/server/db/client';
import { createWhatsAppWebhook } from '@/server/wa/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  return createWhatsAppWebhook(getAppDb())(request);
}

export { handle as GET, handle as POST };
