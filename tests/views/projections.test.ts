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

describe('the owner projection', () => {
  it('renders one wanted item and nothing about the group', async () => {
    const view = await db.withActor(ownerActor(), (tx) => ownerCircleView(tx, fx.circleId));
    if (view === null) throw new Error('owner lost their own circle');

    expect(view.items.map((i) => i.title)).toEqual(['Trail runners']);
    expect(view.shareSlug).toMatch(/^t-/);
    expect(view.attributes).toHaveLength(3);
    // Structural, not cosmetic: the owner's payload has no slot a claim could arrive in.
    expect(Object.keys(view.items[0]!).sort()).toEqual(['confirmed', 'id', 'price', 'retailer', 'title']);
  });

  it('is null when the caller is not the owner, even on the owner role', async () => {
    // The threat this pins is a route bug: a friend's user id handed to the owner builder under
    // the owner role. The owner policies key off app.user_id, so the circle row never appears
    // and the route gets its null to turn into a 404.
    const view = await db.withActor({ role: 'owner', userId: fx.friendAUserId, circleId: fx.circleId }, (tx) =>
      ownerCircleView(tx, fx.circleId),
    );
    expect(view).toBeNull();
  });
});

describe('the friend projection', () => {
  it('shows the secret suggestion, the tombstone and the money behind them', async () => {
    const view = await db.withActor(friendActor(fx.friendAUserId), (tx) =>
      friendCircleView(tx, fx.circleId, fx.friendAUserId),
    );
    if (view === null) throw new Error('friend lost the circle they are in');

    expect(view.items).toHaveLength(3);
    // The friend payload has no slot for the invite link: it is the owner's to share.
    expect(Object.keys(view).sort()).toEqual(['attributes', 'eventDate', 'items', 'name', 'occasion']);
    expect(view.items.filter((i) => i.secret)).toHaveLength(1);
    expect(view.items.filter((i) => i.status === 'tombstoned')).toHaveLength(1);

    const grinder = view.items.find((i) => i.title === 'Coffee grinder')!;
    expect(grinder.pool).toMatchObject({ target: 'R4 200.00', settled: 'R0.00', status: 'open', iAmBuyer: true, contributors: 2 });
    expect(grinder.claimedByMe).toBe(true);

    const shoe = view.items.find((i) => i.title === 'Trail runners')!;
    expect(shoe.price).toBe('R1 899.00');
    expect(shoe.pool).toBeNull();
  });

  it('keeps a private attribute out of the sheet that stops a wrong-size buy', async () => {
    const view = await db.withActor(friendActor(fx.friendBUserId), (tx) =>
      friendCircleView(tx, fx.circleId, fx.friendBUserId),
    );
    // Order is the AttributeKind enum's declaration order, not alphabetical — Postgres sorts
    // enums by internal label position. Stable either way, which is what the sheet needs.
    expect(view!.attributes.map((a) => a.kind)).toEqual(['ring_size', 'colour']);
  });

  it('is null for a friend who never joined', async () => {
    const view = await db.withActor(friendActor(fx.outsiderUserId), (tx) =>
      friendCircleView(tx, fx.circleId, fx.outsiderUserId),
    );
    expect(view).toBeNull();
  });
});
