import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/server/db/client';
import { handleCircleGet, handleCirclePost } from '@/server/routes/circle';
import { issueSession, SESSION_COOKIE } from '@/server/auth/session';
import { env } from '@/lib/env';
import { seedCircle, type CircleFixture } from './fixtures';

/**
 * The event date is the one circle column whose visibility depends on *who wrote it*, and RLS
 * cannot express that: it filters rows, never columns, and `app_owned` deliberately holds a
 * table-wide SELECT on `circles` (`001_roles.sql`) so the route can tell "not yours" from
 * "does not exist". The guard is `ownerCircleView`, which means the only honest proof is the
 * rendered owner body — a view-object assertion would pass while a screen still printed the date.
 *
 * So every case here asserts on the HTTP response text. Nothing was set up to be red: the suite
 * was run with `ownerCircleView`'s writer comparison replaced by `true`, and both owner-side
 * cases failed on the leaked `<time dateTime="2026-12-19">` and the leaked `value=` in the form.
 * `LEAK_SKIP_POLICIES=1` deliberately does *not* turn this file red — the secrecy here is a column
 * right, and dropping RLS removes only the row right underneath it.
 */

let fx: CircleFixture;
let db: Db;
let slug: string;
const origin = new URL(env.CIRCLE_BASE_URL).origin;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  fx = await seedCircle(url);
  db = fx.db;
  slug = (await db.prisma.circle.findUniqueOrThrow({ where: { id: fx.circleId } })).shareSlug;
});

afterAll(async () => {
  await db?.disconnect();
});

const cookie = (role: 'owner' | 'friend', userId: string) =>
  `${SESSION_COOKIE}=${issueSession({ role, userId, circleId: fx.circleId })}`;

const body = async (role: 'owner' | 'friend', userId: string) =>
  (await handleCircleGet(db, new Request(`${origin}/c/${slug}`, { headers: { cookie: cookie(role, userId) } }), slug)).text();

const setDate = (role: 'owner' | 'friend', userId: string, eventDate: string) =>
  handleCirclePost(db, new Request(`${origin}/c/${slug}/date`, {
    method: 'POST',
    headers: { cookie: cookie(role, userId), origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ intent: 'set_event_date', eventDate }),
  }), slug);

/** Everything a rendered party date looks like: the ISO form, the human form, and the count. */
function dateForms(iso: string, label: string): string[] {
  return [iso, label, `${iso.slice(0, 4)}-${iso.slice(5, 7)}`];
}

describe('a party date a friend wrote is not the owner’s to see', () => {
  it('disappears from the owner body entirely once a friend overwrote it', async () => {
    // Owner-written to start with, so the absence below cannot be an artifact of an unset date.
    expect(await body('owner', fx.ownerUserId)).toContain('2026-12-05');

    const response = await setDate('friend', fx.friendAUserId, '2026-12-19');
    expect(response.status).toBe(303);

    const owner = await body('owner', fx.ownerUserId);
    for (const forbidden of dateForms('2026-12-19', 'Sat 19 Dec').concat(dateForms('2026-12-05', 'Sat 5 Dec'))) {
      expect(owner, `owner body leaked ${forbidden}`).not.toContain(forbidden);
    }
    // No count either, and no `<time>` element for one to sit in. The spec's silence is total:
    // no date, no day count, no sentence explaining the gap.
    expect(owner).not.toMatch(/\d+ days to go|>Today<|>Tomorrow<|The day has passed/);
    expect(owner).not.toContain('<time');
  });

  it('still reaches the friends who wrote it, with the real birthday beside it', async () => {
    await setDate('friend', fx.friendAUserId, '2026-12-19');

    const friend = await body('friend', fx.friendBUserId);
    expect(friend).toContain('2026-12-19');
    expect(friend).toContain('Sat 19 Dec');
    expect(friend).toMatch(/\d+ days to go|Tomorrow|Today|The day has passed/);
    // The birthday is never the secret one: it is theirs to wish on.
    expect(friend).toContain('Birthday: 3 Apr');
  });

  it('names nobody — the writer is recorded, never rendered', async () => {
    await setDate('friend', fx.friendAUserId, '2026-12-19');
    const friend = await body('friend', fx.friendBUserId);
    expect(friend).not.toMatch(/Thabo|Lerato|set by|who set/i);
  });

  it('becomes visible again when the owner overwrites it, because last writer wins', async () => {
    await setDate('friend', fx.friendAUserId, '2026-12-19');
    expect(await body('owner', fx.ownerUserId)).not.toContain('2026-12-19');

    expect((await setDate('owner', fx.ownerUserId, '2026-12-12')).status).toBe(303);
    const owner = await body('owner', fx.ownerUserId);
    expect(owner).toContain('2026-12-12');
    expect(owner).toContain('Sat 12 Dec');
    expect(await body('friend', fx.friendAUserId)).toContain('2026-12-12');
  });
});

describe('the write itself', () => {
  it('stores the date and names the acting session as the writer', async () => {
    expect((await setDate('friend', fx.friendBUserId, '2026-11-28')).status).toBe(303);
    const circle = await db.prisma.circle.findUniqueOrThrow({ where: { id: fx.circleId } });
    expect(circle.eventDate?.toISOString().slice(0, 10)).toBe('2026-11-28');
    expect(circle.eventDateSetByUserId).toBe(fx.friendBUserId);
  });

  it('refuses a person who never joined, and does not move the date', async () => {
    const before = await db.prisma.circle.findUniqueOrThrow({ where: { id: fx.circleId } });
    const response = await setDate('friend', fx.outsiderUserId, '2026-11-30');
    expect(response.status).toBe(404);
    const after = await db.prisma.circle.findUniqueOrThrow({ where: { id: fx.circleId } });
    expect(after.eventDate?.toISOString()).toBe(before.eventDate?.toISOString());
    expect(after.eventDateSetByUserId).toBe(before.eventDateSetByUserId);
  });

  it('cannot be aimed at a circle the session does not name', async () => {
    // The session carries `fx.circleId`; the only way to reach the other circle is through the
    // slug. `app_set_event_date` takes a date and nothing else, so there is no argument to aim.
    const other = await db.prisma.circle.findUniqueOrThrow({ where: { id: fx.otherCircleId } });
    const before = other.eventDate?.toISOString();
    const response = await handleCirclePost(db, new Request(`${origin}/c/${other.shareSlug}/date`, {
      method: 'POST',
      headers: { cookie: cookie('friend', fx.friendAUserId), origin, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ intent: 'set_event_date', eventDate: '2026-11-30' }),
    }), other.shareSlug);
    expect(response.status).toBe(404);
    expect((await db.prisma.circle.findUniqueOrThrow({ where: { id: fx.otherCircleId } })).eventDate?.toISOString()).toBe(before);
  });
});
