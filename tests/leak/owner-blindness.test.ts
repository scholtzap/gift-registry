import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor, Db } from '@/server/db/client';
import { seedCircle, type CircleFixture } from './fixtures';

/**
 * Owner-blindness at the layer that decides it. Route-level rows of the ARCHITECTURE §8
 * matrix (the 404-vs-403 assertions, the card PNG, the link preview) build on top of these
 * and land on day 7; if these are wrong, those are decoration.
 *
 * Run red on purpose once, before the policies exist:
 *   LEAK_SKIP_POLICIES=1 pnpm leak     -> these fail, so the assertions can fail
 *   pnpm leak                          -> the same assertions pass
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

const owner = (): Actor => ({ role: 'owner', userId: fx.ownerUserId, circleId: fx.circleId });
const friend = (userId: string): Actor => ({ role: 'friend', userId, circleId: fx.circleId });

describe('the owner cannot see what the group is doing', () => {
  it('sees only their own confirmed, un-tombstoned items', async () => {
    const asOwner = await db.withActor(owner(), (tx) => tx.item.findMany({ select: { id: true } }));
    const asFriend = await db.withActor(friend(fx.friendAUserId), (tx) => tx.item.findMany({ select: { id: true } }));

    expect(asOwner.map((i) => i.id)).toEqual([fx.itemOwnId]);
    // The friend projection keeps both the secret suggestion and the tombstone: the owner's
    // delete is a soft delete, and the money behind it survives.
    expect(asFriend.map((i) => i.id).sort()).toEqual([fx.itemOwnId, fx.itemSecretId, fx.itemGoneId].sort());
  });

  it('cannot see that anything is claimed', async () => {
    expect(await db.withActor(owner(), (tx) => tx.claim.count())).toBe(0);
    expect(await db.withActor(friend(fx.friendAUserId), (tx) => tx.claim.count())).toBe(2);
  });

  it('cannot see the pool or who promised money', async () => {
    expect(await db.withActor(owner(), (tx) => tx.pool.count())).toBe(0);
    expect(await db.withActor(owner(), (tx) => tx.contribution.count())).toBe(0);
    expect(await db.withActor(friend(fx.friendBUserId), (tx) => tx.pool.count())).toBe(1);
    expect(await db.withActor(friend(fx.friendBUserId), (tx) => tx.contribution.count())).toBe(2);
  });

  it('cannot see the gift card or the messages on it', async () => {
    expect(await db.withActor(owner(), (tx) => tx.cardEntry.count())).toBe(0);
    expect(await db.withActor(owner(), (tx) => tx.giftCard.count())).toBe(0);
    expect(await db.withActor(friend(fx.friendAUserId), (tx) => tx.cardEntry.count())).toBe(2);
    expect(await db.withActor(friend(fx.friendAUserId), (tx) => tx.giftCard.count())).toBe(1);
  });

  it('reads a ledger that has the money rows filtered out of it', async () => {
    const asOwner = await db.withActor(owner(), (tx) => tx.ledgerEvent.findMany({ select: { entity: true } }));
    const asFriend = await db.withActor(friend(fx.friendAUserId), (tx) => tx.ledgerEvent.findMany({ select: { entity: true } }));

    expect(asOwner.map((e) => e.entity)).toEqual(['item']);
    expect(asFriend).toHaveLength(3);
  });

  it('sees its own private attributes, friends only the shared ones', async () => {
    const asOwner = await db.withActor(owner(), (tx) => tx.attribute.count());
    const asFriend = await db.withActor(
      friend(fx.friendBUserId),
      (tx) => tx.attribute.findMany({ select: { valueText: true } }),
    );

    expect(asOwner).toBe(3);
    expect(asFriend.map((a) => a.valueText)).not.toContain('sleeps badly, eye mask helps');
    expect(asFriend).toHaveLength(2);
  });
});

describe('the switch is the security boundary, not a naming convention', () => {
  it('holds the role it claims to hold', async () => {
    const seen = await db.withActor(owner(), (tx) => tx.$queryRaw<{ r: string }[]>`SELECT current_user::text AS r`);
    expect(seen[0]!.r).toBe('app_owned');

    const asFriend = await db.withActor(friend(fx.friendAUserId), (tx) => tx.$queryRaw<{ r: string }[]>`SELECT current_user::text AS r`);
    expect(asFriend[0]!.r).toBe('app_friend');
  });

  it('refuses a friend who is not in the circle the session names', async () => {
    const items = await db.withActor(
      { role: 'friend', userId: fx.outsiderUserId, circleId: fx.circleId },
      (tx) => tx.item.count(),
    );
    expect(items).toBe(0);
  });

  // Being allowed to see *someone* is not the same as being allowed to see everyone. A roster
  // policy written as "the session names a circle I belong to" without correlating the row
  // returns the whole `users` table — including `phone_e164` and `bsuid` for people in other
  // circles. The predicate has to be about *this* row's membership.
  it('reads only the roster of the circle the session names, on both sides', async () => {
    const roster = [fx.ownerUserId, fx.friendAUserId, fx.friendBUserId].sort();

    const asFriend = await db.withActor(friend(fx.friendAUserId), (tx) =>
      tx.user.findMany({ select: { id: true } }),
    );
    expect(asFriend.map((u) => u.id).sort()).toEqual(roster);

    const asOwner = await db.withActor(owner(), (tx) => tx.user.findMany({ select: { id: true } }));
    expect(asOwner.map((u) => u.id).sort()).toEqual(roster);
  });

  it('cannot read a user who never joined, not even their identifier', async () => {
    const rows = await db.withActor(friend(fx.friendAUserId), (tx) =>
      tx.user.findMany({ where: { id: fx.outsiderUserId }, select: { displayName: true } }),
    );
    expect(rows).toEqual([]);
  });

  // `memberships_self_join` used to be `user_id = app_user_id() AND role = 'friend' AND
  // status = 'active'` with no circle in it, which is true for every circle at once.
  //
  // Raw inserts, not Prisma `create`: `create` always emits `RETURNING *`, and INSERT ... RETURNING
  // is filtered by the table's SELECT policy. `memberships_friend_read` requires an *existing*
  // membership, so a first join is invisible to its own RETURNING clause and Prisma reports 42501
  // for the read, not the write — which would make both assertions below pass for the wrong reason.
  it('joins only the circle the session names, never another one', async () => {
    const join = (userId: string, sessionCircle: string, rowCircle: string) =>
      db.withActor({ role: 'friend', userId, circleId: sessionCircle }, (tx) =>
        tx.$executeRaw`INSERT INTO memberships (id, circle_id, user_id, role, status)
                       VALUES (gen_random_uuid(), ${rowCircle}, ${userId}, 'friend', 'active')`,
      );

    // Uncorrelated, so it is true for every circle. Correlated, so it fires.
    await expect(join(fx.friendAUserId, fx.circleId, fx.otherCircleId)).rejects.toThrow(/42501|row-level security/);

    // Positive control: the identical write against the circle the session does name. Without
    // this, a predicate nobody can satisfy looks exactly like a fix.
    expect(await join(fx.friendBUserId, fx.otherCircleId, fx.otherCircleId)).toBe(1);
  });

  it('fails closed on a malformed actor id instead of returning the world', async () => {
    await expect(
      db.withActor(
        { role: 'friend', userId: 'not-a-uuid', circleId: fx.circleId },
        (tx) => tx.item.count(),
      ),
    ).rejects.toThrow();
  });

  it('does not protect anything from the login role itself', async () => {
    // Documented, not a bug: the app role owns the tables, so RLS does not apply to it.
    // This is why friend-scoped reads go through withActor and nothing queries `prisma` directly.
    expect(await db.prisma.contribution.count()).toBeGreaterThan(0);
  });
});
