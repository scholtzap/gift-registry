import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor, Db } from '@/server/db/client';
import { friendCircleView, ownerCircleView } from '@/server/views';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * RLS says which rows a role gets; this suite says what each role is *shown* from them.
 * Two projections of one ledger is the product, so the shapes are asserted, not assumed:
 * a future column added to `items` must be declared for one side or the other, and a test
 * that only counts rows would not notice it landing in both.
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

const ownerActor = (): Actor => ({ role: 'owner', userId: fx.ownerUserId, circleId: fx.circleId });
const friendActor = (userId: string): Actor => ({ role: 'friend', userId, circleId: fx.circleId });

/** Fixed clock: 2026-11-23 in Johannesburg, twelve days before the fixture's 2026-12-05 party. */
const NOW = new Date('2026-11-23T08:00:00.000Z');

/** Point the writer column at a friend, the way `app_set_event_date` would after their POST. */
async function friendWroteTheDate(userId: string = fx.friendAUserId): Promise<void> {
  await db.prisma.circle.update({ where: { id: fx.circleId }, data: { eventDateSetByUserId: userId } });
}

describe('the owner projection', () => {
  it('renders one wanted item and nothing about the group', async () => {
    const view = await db.withActor(ownerActor(), (tx) => ownerCircleView(tx, fx.circleId, NOW));
    if (view === null) throw new Error('owner lost their own circle');

    expect(view.items.map((i) => i.title)).toEqual(['Trail runners']);
    expect(view.shareSlug).toMatch(/^t-/);
    expect(view.attributes).toHaveLength(3);
    // Structural, not cosmetic: the owner's payload has no slot a claim could arrive in.
    expect(Object.keys(view.items[0]!).sort()).toEqual(['confirmed', 'hasPhoto', 'id', 'price', 'retailer', 'title']);
    // And no slot for a writer either — the date is the owner's own or absent.
    expect(Object.keys(view).sort()).toEqual([
      'accessRequests', 'attributes', 'birthday', 'countdown', 'eventDate', 'eventDateLabel', 'items', 'name', 'occasion', 'shareSlug',
    ]);
  });

  it('shows its own party date, counted from a fixed clock', async () => {
    const view = (await db.withActor(ownerActor(), (tx) => ownerCircleView(tx, fx.circleId, NOW)))!;
    expect(view.eventDate).toBe('2026-12-05');
    expect(view.eventDateLabel).toBe('Sat 5 Dec');
    expect(view.countdown).toBe('12 days to go');
    expect(view.birthday).toBe('3 Apr');
  });

  it('loses the date the moment a friend writes it, and gains nothing in its place', async () => {
    await friendWroteTheDate();
    try {
      const view = (await db.withActor(ownerActor(), (tx) => ownerCircleView(tx, fx.circleId, NOW)))!;
      expect(view.eventDate).toBeNull();
      expect(view.eventDateLabel).toBeNull();
      expect(view.countdown).toBeNull();
      // The birthday is theirs and stays — so this is a narrowed column, not a blanked panel.
      expect(view.birthday).toBe('3 Apr');
      expect(view.name).toBe("Naledi's 30th");
    } finally {
      await friendWroteTheDate(fx.ownerUserId);
    }
  });

  it('is null when the caller is not the owner, even on the owner role', async () => {
    // The threat this pins is a route bug: a friend's user id handed to the owner builder under
    // the owner role. The owner policies key off app.user_id, so the circle row never appears
    // and the route gets its null to turn into a 404.
    const view = await db.withActor({ role: 'owner', userId: fx.friendAUserId, circleId: fx.circleId }, (tx) =>
      ownerCircleView(tx, fx.circleId, NOW),
    );
    expect(view).toBeNull();
  });
});

describe('the friend projection', () => {
  it('shows the secret suggestion, the tombstone and the money behind them', async () => {
    const view = await db.withActor(friendActor(fx.friendAUserId), (tx) =>
      friendCircleView(tx, fx.circleId, fx.friendAUserId, NOW),
    );
    if (view === null) throw new Error('friend lost the circle they are in');

    expect(view.items).toHaveLength(3);
    // The friend payload has no slot for the invite link (it is the owner's to share) and no slot
    // for the writer's id: who set the date is recorded in the row and rendered nowhere.
    expect(Object.keys(view).sort()).toEqual([
      'attributes', 'birthday', 'countdown', 'eventDate', 'eventDateLabel', 'items', 'name', 'occasion',
    ]);
    expect(view.items.filter((i) => i.secret)).toHaveLength(1);
    expect(view.items.filter((i) => i.status === 'tombstoned')).toHaveLength(1);

    const grinder = view.items.find((i) => i.title === 'Coffee grinder')!;
    expect(grinder.pool).toMatchObject({
      target: '$4,200', settled: '$0', currency: 'USD', status: 'open',
      buyerName: 'Thabo Nkosi', iAmBuyer: true, contributors: 2,
    });
    expect(grinder.claimedByMe).toBe(true);
    expect(grinder.claimedByName).toBeNull();

    const shoe = view.items.find((i) => i.title === 'Trail runners')!;
    expect(shoe).toMatchObject({ price: '$1,899', currency: 'USD', hasPhoto: false });
    expect(shoe.pool).toBeNull();
    expect(shoe.claimedByName).toBeNull();
  });

  it('shows the solo claimer to a friend who is not buying it', async () => {
    const claimed = await db.prisma.item.create({
      data: {
        circle: { connect: { id: fx.circleId } },
        addedBy: { connect: { id: fx.ownerUserId } },
        title: 'Claimed picnic blanket',
        visibility: 'owner_visible',
        confirmed: true,
      },
    });
    await db.prisma.claim.create({
      data: { itemId: claimed.id, userId: fx.friendAUserId, kind: 'solo', status: 'claimed' },
    });
    try {
      const view = await db.withActor(friendActor(fx.friendBUserId), (tx) =>
        friendCircleView(tx, fx.circleId, fx.friendBUserId, NOW),
      );
      const blanket = view!.items.find((i) => i.title === 'Claimed picnic blanket')!;
      expect(blanket.claimedByMe).toBe(false);
      expect(blanket.claimedByName).toBe('Thabo Nkosi');
      expect(blanket.pool).toBeNull();
    } finally {
      await db.prisma.item.delete({ where: { id: claimed.id } });
    }
  });

  it('keeps both dates when a friend wrote the party date — the writer is not a viewer', async () => {
    await friendWroteTheDate();
    try {
      const view = (await db.withActor(friendActor(fx.friendBUserId), (tx) =>
        friendCircleView(tx, fx.circleId, fx.friendBUserId, NOW)))!;
      expect(view.eventDate).toBe('2026-12-05');
      expect(view.eventDateLabel).toBe('Sat 5 Dec');
      expect(view.countdown).toBe('12 days to go');
      expect(view.birthday).toBe('3 Apr');
    } finally {
      await friendWroteTheDate(fx.ownerUserId);
    }
  });

  it('renders the day itself and the day after the party on a fixed clock', async () => {
    const onTheDay = (await db.withActor(friendActor(fx.friendAUserId), (tx) =>
      friendCircleView(tx, fx.circleId, fx.friendAUserId, new Date('2026-12-04T22:30:00.000Z'))))!;
    // 22:30Z on the 4th is already 5 December in Johannesburg, so the party is Today.
    expect(onTheDay.countdown).toBe('Today');

    const after = (await db.withActor(friendActor(fx.friendAUserId), (tx) =>
      friendCircleView(tx, fx.circleId, fx.friendAUserId, new Date('2026-12-06T08:00:00.000Z'))))!;
    expect(after.countdown).toBe('The day has passed');
  });

  it('keeps a private attribute out of the sheet that stops a wrong-size buy', async () => {
    const view = await db.withActor(friendActor(fx.friendBUserId), (tx) =>
      friendCircleView(tx, fx.circleId, fx.friendBUserId, NOW),
    );
    // Order is the AttributeKind enum's declaration order, not alphabetical — Postgres sorts
    // enums by internal label position. Stable either way, which is what the sheet needs.
    expect(view!.attributes.map((a) => a.kind)).toEqual(['ring_size', 'colour']);
  });

  it('is null for a friend who never joined', async () => {
    const view = await db.withActor(friendActor(fx.outsiderUserId), (tx) =>
      friendCircleView(tx, fx.circleId, fx.outsiderUserId, NOW),
    );
    expect(view).toBeNull();
  });
});
