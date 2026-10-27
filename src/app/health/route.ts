import { NextResponse } from 'next/server';
import { getAppDb } from '@/server/db/client';
import { rlsState } from '@/server/db/policies';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * Liveness *and* the privacy gate in one place. A container that is up but has no policies
 * is the failure mode this deployment actually fears: the app serves every projection to
 * every role and looks healthy. So a missing policy is a 500, not a warning line.
 */
export async function GET() {
  const db = getAppDb();
  try {
    await db.prisma.$queryRaw`SELECT 1`;
    const client = await db.pool.connect();
    const state = await rlsState(client);
    client.release();

    const missing = state.filter((r) => !r.rlsOn || r.policies === 0).map((r) => r.table);
    if (missing.length > 0) {
      return NextResponse.json({ ok: false, database: 'up', rlsMissing: missing }, { status: 500, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, database: 'up', tables: state.length }, { headers: NO_STORE });
  } catch (err) {
    // Name only: a driver error message can carry the connection string.
    console.error('health: database check failed:', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ ok: false, database: 'down' }, { status: 503, headers: NO_STORE });
  }
}
