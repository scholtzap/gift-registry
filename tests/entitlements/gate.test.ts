import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AiCapability } from '@/generated/prisma/enums';
import type { Actor, Db } from '@/server/db/client';
import {
  CapabilityOffError,
  CapabilityUnavailableError,
  DEGRADED_COPY,
  assertCan,
  can,
  setCapability,
} from '@/server/entitlements';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * The gate is a hard-failure guard, not a feature flag, so these assertions are written the way
 * the leak suite is: each one names the wrong belief it would disprove.
 *
 * The three plans are on three different users so a passing test cannot be explained by "the
 * gate always says yes": free refuses `card_art`, premium allows it, internal allows everything.
 */

let fx: CircleFixture;
let db: Db;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  fx = await seedCircle(url);
  db = fx.db;

  // Written with the login role, which owns the tables and therefore bypasses RLS: a fixture
  // that had to satisfy the policies could not tell you whether a policy works.
  await db.prisma.user.update({ where: { id: fx.friendAUserId }, data: { plan: 'premium' } });
  await db.prisma.user.update({ where: { id: fx.ownerUserId }, data: { plan: 'internal' } });
});

afterAll(async () => {
  await db?.disconnect();
});

const friend = (userId: string): Actor => ({ role: 'friend', userId, circleId: fx.circleId });
const owner = (): Actor => ({ role: 'owner', userId: fx.ownerUserId, circleId: fx.circleId });

describe('the gate decides before a token is spent', () => {
  it('grants what the plan grants when the user never touched the switch', async () => {
    // friendB is on `free`, which grants voice intake and refuses generated card art. Both
    // halves matter: a gate that defaults to ON would pass the first assertion and the product
    // would be spending money nobody agreed to.
    expect(await db.withActor(friend(fx.friendBUserId), (tx) => can(tx, friend(fx.friendBUserId), AiCapability.voice_transcribe))).toBe(true);
    expect(await db.withActor(friend(fx.friendBUserId), (tx) => can(tx, friend(fx.friendBUserId), AiCapability.card_art))).toBe(false);
  });

  it('refuses a capability the plan grants once the user turns it off', async () => {
    const actor = friend(fx.friendAUserId); // premium: card_art is granted by plan
    await db.withActor(actor, (tx) => setCapability(tx, actor, AiCapability.card_art, false));

    expect(await db.withActor(actor, (tx) => can(tx, actor, AiCapability.card_art))).toBe(false);
    await expect(db.withActor(actor, (tx) => assertCan(tx, actor, AiCapability.card_art))).rejects.toThrow(CapabilityOffError);
  });

  it('honours a switch turned back on over a plan that refuses it', async () => {
    const actor = friend(fx.friendBUserId); // free: card_art refused by plan
    await db.withActor(actor, (tx) => setCapability(tx, actor, AiCapability.card_art, true));

    expect(await db.withActor(actor, (tx) => can(tx, actor, AiCapability.card_art))).toBe(true);
    await expect(db.withActor(actor, (tx) => assertCan(tx, actor, AiCapability.card_art))).resolves.toBeUndefined();
  });

  it('falls back to the plan when a grant has expired instead of staying on forever', async () => {
    const actor = friend(fx.friendBUserId); // free: deal_search refused by every plan but internal
    await db.prisma.entitlement.create({
      data: {
        userId: fx.friendBUserId,
        capability: AiCapability.deal_search,
        enabled: true,
        source: 'subscription',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    expect(await db.withActor(actor, (tx) => can(tx, actor, AiCapability.deal_search))).toBe(false);
  });

  it.each([-60_000, 60_000])('keeps an opt-out after replacing a grant with expiry offset %i', async offset => {
    const actor = friend(fx.friendAUserId);
    await db.prisma.entitlement.upsert({
      where: { userId_capability: { userId: actor.userId, capability: AiCapability.photo_extract } },
      create: { userId: actor.userId, capability: AiCapability.photo_extract, enabled: true, source: 'subscription', expiresAt: new Date(Date.now() + offset) },
      update: { enabled: true, source: 'subscription', expiresAt: new Date(Date.now() + offset) },
    });
    await db.withActor(actor, tx => setCapability(tx, actor, AiCapability.photo_extract, false));
    expect(await db.withActor(actor, tx => can(tx, actor, AiCapability.photo_extract))).toBe(false);
    expect((await db.prisma.entitlement.findUniqueOrThrow({ where: { userId_capability: { userId: actor.userId, capability: AiCapability.photo_extract } } })).expiresAt).toBeNull();
    await expect(db.withActor(actor, tx => assertCan(tx, actor, AiCapability.photo_extract))).rejects.toThrow(CapabilityOffError);
  });

  it('honours an existing user opt-out even when its inherited expiry is past', async () => {
    const actor = friend(fx.friendAUserId);
    await db.prisma.entitlement.create({ data: { userId: actor.userId, capability: AiCapability.assistant_reply, enabled: false, source: 'user', expiresAt: new Date(Date.now() - 60_000) } });
    expect(await db.withActor(actor, tx => can(tx, actor, AiCapability.assistant_reply))).toBe(false);
  });

  it('writes one row however often the switch is tapped', async () => {
    const actor = friend(fx.friendAUserId);
    await db.withActor(actor, (tx) => setCapability(tx, actor, AiCapability.voice_transcribe, false));
    await db.withActor(actor, (tx) => setCapability(tx, actor, AiCapability.voice_transcribe, true));

    const rows = await db.prisma.entitlement.findMany({
      where: { userId: fx.friendAUserId, capability: AiCapability.voice_transcribe },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.enabled).toBe(true);
    expect(rows[0]!.source).toBe('user');
  });
});

describe('the gate fails closed, and says which kind of no it means', () => {
  it('refuses rather than defaults on when the actor is not a user it can see', async () => {
    // `users_self` only admits `id = app_user_id()`, so an actor naming a user that does not
    // exist reads no plan at all. Returning true here would be the false success the spec calls
    // out: a gate that silently becomes a no-op.
    const ghost: Actor = { role: 'friend', userId: '00000000-0000-4000-8000-000000000000', circleId: fx.circleId };

    expect(await db.withActor(ghost, (tx) => can(tx, ghost, AiCapability.voice_transcribe))).toBe(false);
    await expect(db.withActor(ghost, (tx) => assertCan(tx, ghost, AiCapability.voice_transcribe)))
      .rejects.toThrow(CapabilityUnavailableError);
  });

  it('does not let an outage wear the costume of a setting the user chose', async () => {
    const actor = friend(fx.friendBUserId);
    await db.withActor(actor, (tx) => setCapability(tx, actor, AiCapability.card_pun, false));

    await db.withActor(actor, async (tx) => {
      const off = await assertCan(tx, actor, AiCapability.card_pun).then(
        () => null,
        (err: unknown) => err,
      );
      expect(off).toBeInstanceOf(CapabilityOffError);
      expect(off).not.toBeInstanceOf(CapabilityUnavailableError);
      // The degraded copy is the answer the UI renders, so it cannot be empty or invented later.
      expect((off as CapabilityOffError).degraded).toBe(DEGRADED_COPY[AiCapability.card_pun]);
    });
  });

  it('spends nothing when the capability is off', async () => {
    const actor = friend(fx.friendAUserId);
    await db.withActor(actor, (tx) => setCapability(tx, actor, AiCapability.voice_transcribe, false));

    // Stands in for a model path until the real one exists: the contract under test is that the
    // spend happens after the gate and not before it.
    const spend = vi.fn();
    await db.withActor(actor, async (tx) => {
      try {
        await assertCan(tx, actor, AiCapability.voice_transcribe);
        spend();
      } catch (err) {
        if (!(err instanceof CapabilityOffError)) throw err;
      }
    });

    expect(spend).not.toHaveBeenCalled();
  });
});

describe('entitlement rows are never cross-readable between actors', () => {
  it('shows a friend only their own switches', async () => {
    const actor = friend(fx.friendAUserId);
    const rows = await db.withActor(actor, (tx) => tx.entitlement.findMany({ select: { userId: true } }));

    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([fx.friendAUserId]));
  });

  it('shows the owner nobody else’s switches, including the friends in their own circle', async () => {
    const rows = await db.withActor(owner(), (tx) => tx.entitlement.findMany({ select: { userId: true } }));

    expect(new Set(rows.map((r) => r.userId)).size).toBeLessThanOrEqual(1);
    expect(rows.some((r) => r.userId === fx.friendAUserId)).toBe(false);
    expect(rows.some((r) => r.userId === fx.friendBUserId)).toBe(false);
  });

  it('cannot write a switch onto another user', async () => {
    const actor = friend(fx.friendAUserId);
    // Deliberately not `rejects.toThrow()`: a bare throw also passes when the role switch fails,
    // which is how a write policy goes untested while the test stays green. The denial has to
    // name row-level security.
    await expect(
      db.withActor(actor, (tx) =>
        tx.entitlement.create({
          data: { userId: fx.friendBUserId, capability: AiCapability.link_expand, enabled: false },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);

    const victim = await db.prisma.entitlement.findMany({
      where: { userId: fx.friendBUserId, capability: AiCapability.link_expand },
    });
    expect(victim).toHaveLength(0);
  });
});
