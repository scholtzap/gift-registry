import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '@/server/db/client';
import { getCard, saveCardEntry, renderCard } from '@/server/cards';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

// Parent runs this file with the normal real-Postgres setup after the ledger worker stops.
describe('gift-giver card database boundary', () => {
  let fixture: CircleFixture;
  let friend: Actor;
  let otherFriend: Actor;
  let owner: Actor;

  beforeAll(async () => {
    fixture = await seedCircle(process.env.DATABASE_URL_TEST!);
    friend = { role: 'friend', userId: fixture.friendAUserId, circleId: fixture.circleId };
    otherFriend = { role: 'friend', userId: fixture.friendBUserId, circleId: fixture.circleId };
    owner = { role: 'owner', userId: fixture.ownerUserId, circleId: fixture.circleId };
    await fixture.db.prisma.claim.create({
      data: { itemId: fixture.itemOwnId, userId: fixture.friendBUserId, kind: 'solo', status: 'claimed' },
    });
  });

  afterAll(async () => {
    if (!fixture) return;
    await fixture.db.prisma.circle.deleteMany({ where: { id: { in: [fixture.circleId, fixture.otherCircleId] } } });
    await fixture.db.prisma.user.deleteMany({ where: { id: { in: [fixture.ownerUserId, fixture.friendAUserId, fixture.friendBUserId, fixture.outsiderUserId] } } });
    await fixture.db.disconnect();
  });

  it('hides the card from the owner even if the caller forges a friend role', async () => {
    for (const actor of [owner, { ...owner, role: 'friend' as const }]) {
      expect(await fixture.db.withActor(actor, (tx) => getCard(tx, actor, fixture.itemGoneId))).toBeNull();
      await expect(fixture.db.withActor(actor, (tx) => saveCardEntry(tx, actor, fixture.itemGoneId, {
        displayNameShown: 'Naledi', message: 'Not a gift-giver', anonymous: false,
      }))).rejects.toThrow('card_not_found');
      await expect(renderCard(fixture.db, actor, fixture.itemGoneId)).rejects.toThrow('card_not_found');
    }
  });

  it('returns all literal contributor entries on a tombstoned pooled gift without receipt fields', async () => {
    const card = await fixture.db.withActor(friend, (tx) => getCard(tx, friend, fixture.itemGoneId));
    expect(card?.title).toBe('Coffee grinder');
    expect(card?.entries).toHaveLength(2);
    expect(card?.entries).toEqual(expect.arrayContaining([
      { displayNameShown: 'Thabo', message: 'Grind it fine, drink it slow.', anonymous: false },
      { displayNameShown: 'Anonymous', message: 'Happy 30th!', anonymous: true },
    ]));
    expect(JSON.stringify(card)).not.toMatch(/amountMinor|amount_minor|targetMinor|paidAt|paid_at|buyerUserId|promised/);
  });

  it('refuses a member who is neither claimant nor contributor and an outsider', async () => {
    const outsider = { role: 'friend' as const, userId: fixture.outsiderUserId, circleId: fixture.circleId };
    expect(await fixture.db.withActor(friend, (tx) => getCard(tx, friend, fixture.itemOwnId))).toBeNull();
    expect(await fixture.db.withActor(outsider, (tx) => getCard(tx, outsider, fixture.itemGoneId))).toBeNull();
    const wrongCircle = { ...friend, circleId: fixture.otherCircleId };
    expect(await fixture.db.withActor(wrongCircle, (tx) => getCard(tx, wrongCircle, fixture.itemGoneId))).toBeNull();
  });

  it('lets an active solo claimant save and edit only their own literal message', async () => {
    const input = { displayNameShown: 'Lerato', message: '  <b>Enjoy!</b> & shine.  ', anonymous: false };
    await fixture.db.withActor(otherFriend, (tx) => saveCardEntry(tx, otherFriend, fixture.itemOwnId, input));
    const first = await fixture.db.withActor(otherFriend, (tx) => getCard(tx, otherFriend, fixture.itemOwnId));
    expect(first?.myEntry).toEqual(input);
    const changed = { displayNameShown: '', message: 'Happy birthday!', anonymous: true };
    await fixture.db.withActor(otherFriend, (tx) => saveCardEntry(tx, otherFriend, fixture.itemOwnId, changed));
    const second = await fixture.db.withActor(otherFriend, (tx) => getCard(tx, otherFriend, fixture.itemOwnId));
    expect(second?.myEntry).toEqual({ ...changed, displayNameShown: 'Anonymous' });
    expect(second?.entries).toEqual([{ ...changed, displayNameShown: 'Anonymous' }]);
  });

  it('rejects an identity override and a URL without changing another gift-giver\'s entry', async () => {
    await expect(fixture.db.withActor(friend, (tx) => saveCardEntry(tx, friend, fixture.itemGoneId, {
      displayNameShown: 'Thabo', message: 'Replacement', anonymous: false, contributorUserId: fixture.friendBUserId,
    } as never))).rejects.toThrow('invalid_card_entry');
    await expect(fixture.db.withActor(friend, (tx) => saveCardEntry(tx, friend, fixture.itemGoneId, {
      displayNameShown: 'Thabo', message: 'example.com/deal', anonymous: false,
    }))).rejects.toThrow('invalid_card_entry');
    const unchanged = await fixture.db.withActor(otherFriend, (tx) => getCard(tx, otherFriend, fixture.itemGoneId));
    expect(unchanged?.myEntry?.message).toBe('Happy 30th!');
  });

  it('round-trips unsupported literal words unchanged and explicitly refuses their PNG export', async () => {
    const input = { displayNameShown: 'Thabo', message: '  \u4f60\u597d & \u{1f389}\r\nWith love  ', anonymous: false };
    await fixture.db.withActor(friend, (tx) => saveCardEntry(tx, friend, fixture.itemGoneId, input));
    const saved = await fixture.db.withActor(friend, (tx) => getCard(tx, friend, fixture.itemGoneId));
    expect(saved?.myEntry).toEqual(input);
    await expect(renderCard(fixture.db, friend, fixture.itemGoneId).then(() => undefined))
      .rejects.toThrow('card_unsupported_glyph');
    const after = await fixture.db.withActor(friend, (tx) => getCard(tx, friend, fixture.itemGoneId));
    expect(after?.myEntry).toEqual(input);
  });

  it('refuses URL names and IP messages on save without overwriting the literal database entry', async () => {
    const before = await fixture.db.withActor(friend, (tx) => getCard(tx, friend, fixture.itemGoneId));
    for (const url of ['https://example.test/deal', '192.0.2.1/deal', '[2001:db8::1]/deal']) {
      for (const field of ['displayNameShown', 'message'] as const) {
        await expect(fixture.db.withActor(friend, (tx) => saveCardEntry(tx, friend, fixture.itemGoneId, {
          displayNameShown: 'Thabo', message: 'Enjoy!', anonymous: false, [field]: url,
        }))).rejects.toThrow('invalid_card_entry');
      }
    }
    const after = await fixture.db.withActor(friend, (tx) => getCard(tx, friend, fixture.itemGoneId));
    expect(after?.myEntry).toEqual(before?.myEntry);
  });

  it('revokes card access when a solo claim is released or the gift-giver leaves the circle', async () => {
    await fixture.db.prisma.claim.update({
      where: { itemId_userId: { itemId: fixture.itemOwnId, userId: otherFriend.userId } }, data: { status: 'released' },
    });
    expect(await fixture.db.withActor(otherFriend, (tx) => getCard(tx, otherFriend, fixture.itemOwnId))).toBeNull();
    await fixture.db.prisma.membership.update({
      where: { circleId_userId: { circleId: fixture.circleId, userId: friend.userId } }, data: { status: 'removed' },
    });
    expect(await fixture.db.withActor(friend, (tx) => getCard(tx, friend, fixture.itemGoneId))).toBeNull();
  });
});
