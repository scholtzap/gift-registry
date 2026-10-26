import { createDb, type Db } from '@/server/db/client';
import { keyedHash } from '@/server/auth/phone-hash';

/** Test-only pepper. Nothing hashed here is a real number, so nothing here is a secret. */
export const PEPPER = 'leak-suite-pepper';

/**
 * The fictional cast. Names are invented, and deliberately **no phone numbers**: this repo is
 * public, a fixture number is one keystroke away from a real subscriber, and the `users`
 * identity CHECK is satisfied by BSUID alone. Allowlist rows hash an opaque per-run token
 * instead, which is the same shape the table stores for a real gate.
 */
function fictionalCast() {
  const salt = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const person = (n: number, name: string) => ({
    name,
    bsuid: `AAfictional${salt}${String(n).padStart(3, '0')}`,
    token: `allowlist-token-${salt}-${n}`,
  });
  return {
    owner: person(1, 'Naledi Dlamini'),
    friendA: person(2, 'Thabo Nkosi'),
    friendB: person(3, 'Lerato Mahlangu'),
    outsider: person(9, 'Outsider Who Never Joined'),
  };
}

export interface CircleFixture {
  db: Db;
  circleId: string;
  ownerUserId: string;
  friendAUserId: string;
  friendBUserId: string;
  /** A real user with no membership in the circle — the negative case. */
  outsiderUserId: string;
  /** Owner-authored, active — the only item the owner should ever see. */
  itemOwnId: string;
  /** A friend's secret suggestion: same circle, different projection. */
  itemSecretId: string;
  /** Soft-deleted by the owner ("bought it myself"); the pool behind it still exists. */
  itemGoneId: string;
  poolId: string;
}

/**
 * Writes with the login role, which owns the tables and therefore bypasses RLS. That is
 * deliberate: a fixture that had to pass its own policies to seed data could not tell you
 * whether a policy works or simply never saw anything.
 */
export async function seedCircle(connectionString: string): Promise<CircleFixture> {
  const cast = fictionalCast();
  const db = createDb(connectionString);
  const [owner, friendA, friendB, outsider] = await Promise.all([
    db.prisma.user.create({ data: { bsuid: cast.owner.bsuid, displayName: cast.owner.name } }),
    db.prisma.user.create({ data: { bsuid: cast.friendA.bsuid, displayName: cast.friendA.name } }),
    db.prisma.user.create({ data: { bsuid: cast.friendB.bsuid, displayName: cast.friendB.name } }),
    db.prisma.user.create({ data: { bsuid: cast.outsider.bsuid, displayName: cast.outsider.name } }),
  ]);

  const circle = await db.prisma.circle.create({
    data: {
      name: "Naledi's 30th",
      occasion: 'birthday',
      eventDate: new Date('2026-12-05T00:00:00.000Z'),
      ownerUserId: owner.id,
      shareSlug: `t-${owner.id.slice(0, 12)}`,
      memberships: {
        create: [
          { userId: owner.id, role: 'owner' },
          { userId: friendA.id, role: 'friend' },
          { userId: friendB.id, role: 'friend' },
        ],
      },
      allowlist: {
        create: [
          { phoneE164Hash: keyedHash(cast.friendA.token, PEPPER), addedBy: owner.id, status: 'accepted' },
          { phoneE164Hash: keyedHash(cast.friendB.token, PEPPER), addedBy: owner.id, status: 'accepted' },
        ],
      },
    },
  });

  // Attributes belong to the gift target, not to the circle — which is why a friend reads them
  // through the circle's owner rather than through a circle foreign key.
  await db.prisma.attribute.createMany({
    data: [
      { userId: owner.id, kind: 'ring_size', valueText: 'N58', visibility: 'friends' },
      { userId: owner.id, kind: 'colour', valueText: 'burnt orange', visibility: 'friends' },
      { userId: owner.id, kind: 'other', valueText: 'sleeps badly, eye mask helps', visibility: 'private' },
    ],
  });

  const [itemOwn, itemSecret, itemGone] = await Promise.all([
    db.prisma.item.create({
      data: {
        circle: { connect: { id: circle.id } },
        addedBy: { connect: { id: owner.id } },
        title: 'Trail runners',
        visibility: 'owner_visible',
        priceMinor: 189900,
        confirmed: true,
      },
    }),
    db.prisma.item.create({
      data: {
        circle: { connect: { id: circle.id } },
        addedBy: { connect: { id: friendA.id } },
        title: 'Same shoe, R3 400 cheaper elsewhere',
        visibility: 'friend_only',
        priceMinor: 155900,
      },
    }),
    db.prisma.item.create({
      data: {
        circle: { connect: { id: circle.id } },
        addedBy: { connect: { id: owner.id } },
        title: 'Coffee grinder',
        visibility: 'owner_visible',
        priceMinor: 420000,
      },
    }),
  ]);

  const pool = await db.prisma.pool.create({
    data: {
      item: { connect: { id: itemGone.id } },
      buyer: { connect: { id: friendA.id } },
      targetMinor: 420000,
      claims: {
        create: [
          { user: { connect: { id: friendA.id } }, item: { connect: { id: itemGone.id } }, kind: 'pool_member' },
          { user: { connect: { id: friendB.id } }, item: { connect: { id: itemGone.id } }, kind: 'pool_member' },
        ],
      },
      contributions: {
        create: [
          { user: { connect: { id: friendA.id } }, amountMinor: 210000, status: 'promised' },
          { user: { connect: { id: friendB.id } }, amountMinor: 210000, status: 'promised' },
        ],
      },
    },
  });

  await db.prisma.item.update({
    where: { id: itemGone.id },
    data: { status: 'tombstoned', tombstoneReason: 'bought_self', tombstonedAt: new Date() },
  });

  await db.prisma.cardEntry.createMany({
    data: [
      { itemId: itemGone.id, contributorUserId: friendA.id, displayNameShown: 'Thabo', message: 'Grind it fine, drink it slow.' },
      { itemId: itemGone.id, contributorUserId: friendB.id, displayNameShown: 'Anonymous', anonymous: true, message: 'Happy 30th!' },
    ],
  });
  await db.prisma.giftCard.create({
    data: {
      item: { connect: { id: itemGone.id } },
      createdBy: { connect: { id: friendA.id } },
      pun: 'You make life smooth',
      tagline: 'from Thabo and 1 other',
      modelUsed: 'muse-spark-1.3',
    },
  });

  await db.prisma.ledgerEvent.createMany({
    data: [
      { circleId: circle.id, entity: 'item', entityId: itemOwn.id, actorUserId: owner.id, action: 'item.added' },
      { circleId: circle.id, entity: 'pool', entityId: pool.id, actorUserId: friendA.id, action: 'pool.opened' },
      { circleId: circle.id, entity: 'contribution', entityId: pool.id, actorUserId: friendB.id, action: 'contribution.promised' },
    ],
  });

  return {
    db,
    circleId: circle.id,
    ownerUserId: owner.id,
    friendAUserId: friendA.id,
    friendBUserId: friendB.id,
    outsiderUserId: outsider.id,
    itemOwnId: itemOwn.id,
    itemSecretId: itemSecret.id,
    itemGoneId: itemGone.id,
    poolId: pool.id,
  };
}
