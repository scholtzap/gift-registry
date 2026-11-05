import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Db } from '@/server/db/client';
import { issueSession, SESSION_COOKIE } from '@/server/auth/session';
import { handleDashboardPost } from '@/server/routes/dashboard';
import { loadDashboard, setMembershipDashboardHidden } from '@/server/views/dashboard';
import { env } from '@/lib/env';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * Friend archive = hide from the active list into collapsible Archived only.
 * Ledger and money state are untouched.
 */

let fx: CircleFixture;
let db: Db;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  fx = await seedCircle(url);
  db = fx.db;
});

afterAll(async () => {
  await db?.disconnect();
});

const appOrigin = new URL(env.CIRCLE_BASE_URL).origin;

it('sorts and archives friend memberships without deleting the membership row', async () => {
  const earlier = await db.prisma.circle.create({
    data: {
      name: 'Sooner party',
      occasion: 'birthday',
      eventDate: new Date('2026-11-10T00:00:00.000Z'),
      ownerUserId: fx.ownerUserId,
      shareSlug: `arch-soon-${fx.circleId.slice(0, 6)}`,
      memberships: { create: [{ userId: fx.friendAUserId, role: 'friend', status: 'active' }] },
    },
  });
  const later = await db.prisma.circle.create({
    data: {
      name: 'Later party',
      occasion: 'birthday',
      eventDate: new Date('2026-12-20T00:00:00.000Z'),
      ownerUserId: fx.ownerUserId,
      shareSlug: `arch-late-${fx.circleId.slice(0, 6)}`,
      memberships: { create: [{ userId: fx.friendAUserId, role: 'friend', status: 'active' }] },
    },
  });

  const session = { userId: fx.friendAUserId, circleId: fx.circleId, role: 'friend' as const };
  let view = await loadDashboard(db, session);
  expect(view).not.toBeNull();
  const activeIds = view!.forOthers.map((c) => c.id);
  expect(activeIds.indexOf(earlier.id)).toBeLessThan(activeIds.indexOf(later.id));
  expect(view!.archived.map((c) => c.id)).not.toContain(earlier.id);

  expect(await setMembershipDashboardHidden(db, fx.friendAUserId, earlier.id, true)).toBe(true);
  view = await loadDashboard(db, session);
  expect(view!.forOthers.map((c) => c.id)).not.toContain(earlier.id);
  expect(view!.archived.map((c) => c.id)).toContain(earlier.id);

  const row = await db.prisma.membership.findFirst({
    where: { userId: fx.friendAUserId, circleId: earlier.id },
    select: { status: true, dashboardHidden: true },
  });
  expect(row).toEqual({ status: 'active', dashboardHidden: true });

  const cookie = `${SESSION_COOKIE}=${issueSession(session)}`;
  const res = await handleDashboardPost(
    db,
    new Request(`${appOrigin}/app/dashboard`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: appOrigin,
        cookie,
      },
      body: new URLSearchParams({ intent: 'unarchive', circleId: earlier.id }).toString(),
    }),
  );
  expect(res.status).toBe(303);
  view = await loadDashboard(db, session);
  expect(view!.forOthers.map((c) => c.id)).toContain(earlier.id);
  expect(view!.archived.map((c) => c.id)).not.toContain(earlier.id);
});
