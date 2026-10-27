import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Actor, type Db } from '@/server/db/client';
import { keyedHash } from '@/server/auth/phone-hash';
import { PEPPER } from './fixtures';

/**
 * RN-A D1/D3, RN-C: a proxy circle has owner_user_id NULL. Under Postgres
 * three-valued logic `ci.owner_user_id <> app_user_id()` is NULL there, so
 * without the explicit NULL branch every friend policy fails closed and the
 * circle renders empty. This suite proves both halves: members are admitted,
 * strangers and any owner-seat read still see nothing.
 */

let db: Db;
let circleId: string;
let itemId: string;
let creatorId: string;
let memberId: string;
let outsiderId: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  db = createDb(url);
  const salt = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const mk = (n: number) =>
    db.prisma.user.create({ data: { bsuid: `AAproxy${salt}${n}`, displayName: `Proxy Cast ${n}` } });
  const [creator, member, outsider] = [await mk(1), await mk(2), await mk(3)];
  creatorId = creator.id;
  memberId = member.id;
  outsiderId = outsider.id;

  const circle = await db.prisma.circle.create({
    data: {
      name: 'Proxy circle',
      occasion: 'birthday',
      eventDate: new Date('2026-12-05T00:00:00.000Z'),
      ownerUserId: null,
      recipientLabel: 'A Friend',
      recipientPhoneE164Hash: keyedHash(`proxy-recipient-${salt}`, PEPPER),
      proxyCreatedByUserId: creator.id,
      shareSlug: `p-${salt}`,
      memberships: {
        create: [
          { userId: creator.id, role: 'friend' },
          { userId: member.id, role: 'friend' },
        ],
      },
      allowlist: {
        create: [
          {
            phoneE164Hash: keyedHash(`proxy-recipient-${salt}`, PEPPER),
            addedBy: creator.id,
            status: 'pending',
          },
        ],
      },
    },
  });
  circleId = circle.id;
  const item = await db.prisma.item.create({
    data: {
      circle: { connect: { id: circle.id } },
      addedBy: { connect: { id: creator.id } },
      title: 'Trail runners',
      visibility: 'friend_only',
      priceMinor: 189900,
      confirmed: true,
    },
  });
  itemId = item.id;
});

afterAll(async () => {
  await db?.disconnect();
});

const asFriend = (userId: string): Actor => ({ role: 'friend', userId, circleId });
const asOwner = (userId: string): Actor => ({ role: 'owner', userId, circleId });

describe('a proxy circle (owner_user_id IS NULL)', () => {
  it('stores the recipient only as a 64-hex digest, with no phantom users row', async () => {
    const circle = await db.prisma.circle.findUnique({ where: { id: circleId } });
    expect(circle?.ownerUserId).toBeNull();
    expect(circle?.recipientPhoneE164Hash).toMatch(/^[a-f0-9]{64}$/);
    // No recipient was invented: this run's cast is exactly the three users,
    // and none of them is reachable as the circle's owner.
    const cast = await db.prisma.user.findMany({
      where: { id: { in: [creatorId, memberId, outsiderId] } },
      select: { id: true },
    });
    expect(cast).toHaveLength(3);
    const recipientRows = await db.prisma.user.count({
      where: { ownedCircles: { some: { id: circleId } } },
    });
    expect(recipientRows).toBe(0);
  });

  it('admits joined friends: the NULL-owner branch reads items (not empty)', async () => {
    const items = await db.withActor(asFriend(memberId), (tx) => tx.item.findMany({ select: { id: true } }));
    expect(items.map((i) => i.id)).toEqual([itemId]);
    const circles = await db.withActor(asFriend(creatorId), (tx) => tx.circle.findMany({ select: { id: true } }));
    expect(circles.map((c) => c.id)).toEqual([circleId]);
  });

  it('still fails closed for a non-member scoped to the circle', async () => {
    expect(await db.withActor(asFriend(outsiderId), (tx) => tx.item.count())).toBe(0);
    expect(await db.withActor(asFriend(outsiderId), (tx) => tx.circle.count())).toBe(0);
  });

  it('renders no owner surface: an owner-role actor owns nothing here', async () => {
    expect(await db.withActor(asOwner(creatorId), (tx) => tx.circle.count())).toBe(0);
    expect(await db.withActor(asOwner(memberId), (tx) => tx.item.count())).toBe(0);
  });
});
