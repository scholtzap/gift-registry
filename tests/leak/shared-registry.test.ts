import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DashboardScreen } from '@/components/screens/dashboard';
import { createDb, type Db } from '@/server/db/client';
import { issueSession } from '@/server/auth/session';
import { handleCircleGet } from '@/server/routes/circle';
import { loadDashboard } from '@/server/views/dashboard';
import { friendCircleView, ownerCircleView } from '@/server/views';
import {
  createRegistryItem,
  linkRegistryItem,
  previewCircleLinks,
  setLinkVisibility,
  setRegistryItemPrivate,
  unlinkRegistryItem,
} from '@/server/ledger/registry';

/**
 * Shared registry + circles dashboard (docs/plans/shared-registry-and-circles.md).
 *
 * One canonical item, two circles, different visibility per link row — each
 * circle's projection shows exactly its share, and the dashboard lists only
 * circles the viewer can open. Written red-first: it fails until the
 * registry_items / circle_item_links construction lands.
 */

let db: Db;
const ids = {
  receiver: '',
  friend: '',
  outsider: '',
  circleA: '',
  circleB: '',
  circleC: '',
  proxyCircle: '',
  registryItem: '',
};
const slugA = `reg-a-${Date.now().toString(36)}`;
const slugB = `reg-b-${Date.now().toString(36)}`;
const slugC = `reg-c-${Date.now().toString(36)}`;
const slugP = `reg-p-${Date.now().toString(36)}`;
const slugPlanned = `reg-planned-${Date.now().toString(36)}`;

const salt = `regtest${Date.now().toString(36)}`;
const person = (n: number, name: string) => ({
  name,
  bsuid: `AAreg${salt}${String(n).padStart(3, '0')}`.slice(0, 30),
});

async function seed(): Promise<void> {
  const cast = {
    receiver: person(1, 'Registry Receiver'),
    friend: person(2, 'Registry Friend'),
    outsider: person(9, 'Registry Outsider'),
    otherOwner: person(4, 'Other Owner'),
  };
  const [receiver, friend, outsider, otherOwner] = await Promise.all([
    db.prisma.user.create({ data: { bsuid: cast.receiver.bsuid, displayName: cast.receiver.name } }),
    db.prisma.user.create({ data: { bsuid: cast.friend.bsuid, displayName: cast.friend.name } }),
    db.prisma.user.create({ data: { bsuid: cast.outsider.bsuid, displayName: cast.outsider.name } }),
    db.prisma.user.create({ data: { bsuid: cast.otherOwner.bsuid, displayName: cast.otherOwner.name } }),
  ]);
  const mkCircle = (name: string, slug: string, ownerId: string, members: { id: string; role: 'owner' | 'friend' }[]) =>
    db.prisma.circle.create({
      data: {
        name,
        occasion: 'birthday',
        eventDate: new Date('2026-12-05T00:00:00.000Z'),
        eventDateSetByUserId: ownerId,
        ownerUserId: ownerId,
        shareSlug: slug,
        memberships: { create: members.map((m) => ({ userId: m.id, role: m.role })) },
      },
    });
  const circleA = await mkCircle("Receiver's 30th", slugA, receiver.id, [
    { id: receiver.id, role: 'owner' },
    { id: friend.id, role: 'friend' },
  ]);
  const circleB = await mkCircle("Receiver's Housewarming", slugB, receiver.id, [
    { id: receiver.id, role: 'owner' },
    { id: friend.id, role: 'friend' },
  ]);
  // The receiver is a plain friend here: it must appear under member circles.
  const circleC = await mkCircle("Other Owner's 40th", slugC, otherOwner.id, [
    { id: otherOwner.id, role: 'owner' },
    { id: receiver.id, role: 'friend' },
  ]);
  const proxyCircle = await db.prisma.circle.create({
    data: {
      name: 'Proxy surprise',
      occasion: 'birthday',
      eventDate: new Date('2026-12-05T00:00:00.000Z'),
      ownerUserId: null,
      recipientLabel: 'Someone',
      recipientPhoneE164Hash: `hash-${salt}`,
      proxyCreatedByUserId: friend.id,
      shareSlug: slugP,
      memberships: { create: [{ userId: friend.id, role: 'friend' }] },
    },
  });
  await db.prisma.circle.create({
    data: {
      name: 'Planned without a seat',
      occasion: 'birthday',
      eventDate: new Date('2026-12-05T00:00:00.000Z'),
      ownerUserId: null,
      proxyCreatedByUserId: receiver.id,
      shareSlug: slugPlanned,
    },
  });

  ids.receiver = receiver.id;
  ids.friend = friend.id;
  ids.outsider = outsider.id;
  ids.circleA = circleA.id;
  ids.circleB = circleB.id;
  ids.circleC = circleC.id;
  ids.proxyCircle = proxyCircle.id;
}

const ownerIn = (circleId: string) => ({ role: 'owner' as const, userId: ids.receiver, circleId });
const friendIn = (circleId: string) => ({ role: 'friend' as const, userId: ids.friend, circleId });

function cookieFor(userId: string, circleId: string, role: 'owner' | 'friend'): string {
  return `gc_session=${issueSession({ userId, circleId, role })}`;
}

async function circleHtml(slug: string, cookie: string): Promise<{ status: number; body: string }> {
  const res = await handleCircleGet(
    db,
    new Request(`http://localhost/c/${slug}`, { headers: { Cookie: cookie } }),
    slug,
  );
  return { status: res.status, body: await res.text() };
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  db = createDb(url);
  await seed();
  // The canonical item, then one visible link (A) and one hidden link (B).
  const item = await db.withActor(ownerIn(ids.circleA), (tx) =>
    createRegistryItem(tx, ownerIn(ids.circleA), { title: 'Shared espresso machine', priceMinor: 249900, currency: 'USD' }),
  );
  ids.registryItem = item.id;
  await db.withActor(ownerIn(ids.circleA), (tx) => linkRegistryItem(tx, ownerIn(ids.circleA), item.id, ids.circleA));
  await db.withActor(ownerIn(ids.circleB), (tx) => linkRegistryItem(tx, ownerIn(ids.circleB), item.id, ids.circleB));
  await db.withActor(ownerIn(ids.circleA), (tx) => previewCircleLinks(tx, ownerIn(ids.circleA), ids.circleA));
  await db.withActor(ownerIn(ids.circleA), (tx) => setLinkVisibility(tx, ownerIn(ids.circleA), item.id, ids.circleA, true));
});

afterAll(async () => {
  await db?.disconnect();
});

describe('per-circle visibility through link rows', () => {
  it('shows the linked item in circle A and hides it in circle B, for both roles', async () => {
    const ownerA = await db.withActor(ownerIn(ids.circleA), (tx) => ownerCircleView(tx, ids.circleA));
    const ownerB = await db.withActor(ownerIn(ids.circleB), (tx) => ownerCircleView(tx, ids.circleB));
    expect(ownerA?.items.map((i) => i.title)).toContain('Shared espresso machine');
    expect(ownerB?.items.map((i) => i.title)).not.toContain('Shared espresso machine');

    const friendA = await db.withActor(friendIn(ids.circleA), (tx) =>
      friendCircleView(tx, ids.circleA, ids.friend),
    );
    const friendB = await db.withActor(friendIn(ids.circleB), (tx) =>
      friendCircleView(tx, ids.circleB, ids.friend),
    );
    expect(friendA?.items.map((i) => i.title)).toContain('Shared espresso machine');
    expect(friendB?.items.map((i) => i.title)).not.toContain('Shared espresso machine');
  });

  it('never renders a hidden link in owner HTML, and never leaks money words there', async () => {
    const shown = await circleHtml(slugA, cookieFor(ids.receiver, ids.circleA, 'owner'));
    expect(shown.status).toBe(200);
    expect(shown.body).toContain('Shared espresso machine');

    const hidden = await circleHtml(slugB, cookieFor(ids.receiver, ids.circleB, 'owner'));
    expect(hidden.status).toBe(200);
    expect(hidden.body).not.toContain('Shared espresso machine');
    for (const word of ['pool', 'claim', 'pledge', 'contribution']) {
      expect(hidden.body.toLowerCase()).not.toContain(word);
    }
  });

  it('keeps the private kill-switch above a visible link', async () => {
    await db.withActor(ownerIn(ids.circleA), (tx) =>
      setRegistryItemPrivate(tx, ownerIn(ids.circleA), ids.registryItem, true),
    );
    try {
      const ownerA = await db.withActor(ownerIn(ids.circleA), (tx) => ownerCircleView(tx, ids.circleA));
      expect(ownerA?.items.map((i) => i.title)).not.toContain('Shared espresso machine');
    } finally {
      await db.withActor(ownerIn(ids.circleA), (tx) =>
        setRegistryItemPrivate(tx, ownerIn(ids.circleA), ids.registryItem, false),
      );
    }
  });

  it('upserts repeated links instead of duplicating them', async () => {
    const actor = ownerIn(ids.circleA);
    await db.withActor(actor, (tx) => linkRegistryItem(tx, actor, ids.registryItem, ids.circleA));
    await db.withActor(actor, (tx) => linkRegistryItem(tx, actor, ids.registryItem, ids.circleA));
    const rows = await db.prisma.circleItemLink.findMany({
      where: { registryItemId: ids.registryItem, circleId: ids.circleA },
    });
    expect(rows).toHaveLength(1);
  });

  it('refuses to show a link before its per-circle preview ran', async () => {
    const actorB = ownerIn(ids.circleB);
    await expect(
      db.withActor(actorB, (tx) => setLinkVisibility(tx, actorB, ids.registryItem, ids.circleB, true)),
    ).rejects.toThrow('ledger_preview_required');
    const row = await db.prisma.circleItemLink.findFirstOrThrow({
      where: { registryItemId: ids.registryItem, circleId: ids.circleB },
    });
    expect(row.visible).toBe(false);
  });

  it('keeps proxy circles on per-circle items: no canonical registry there', async () => {
    const actor = { role: 'owner' as const, userId: ids.receiver, circleId: ids.proxyCircle };
    await expect(
      db.withActor(actor, (tx) => linkRegistryItem(tx, actor, ids.registryItem, ids.proxyCircle)),
    ).rejects.toThrow();
  });

  it('lets a friend role read only visibly-linked canonical rows, never hidden ones', async () => {
    // Scoped to circle A, where the link is visible: exactly the shared wish.
    const inA = await db.withActor(friendIn(ids.circleA), (tx) =>
      tx.registryItem.findMany({ select: { title: true } }),
    );
    expect(inA.map((r) => r.title)).toEqual(['Shared espresso machine']);
    // Scoped to circle B, where the link is hidden: zero rows, not an error.
    const inB = await db.withActor(friendIn(ids.circleB), (tx) => tx.registryItem.count());
    expect(inB).toBe(0);
    const own = await db.withActor(ownerIn(ids.circleA), (tx) => tx.registryItem.count());
    expect(own).toBe(1);
  });

  it('unlinks without touching the canonical item', async () => {
    const extra = await db.withActor(ownerIn(ids.circleB), (tx) =>
      createRegistryItem(tx, ownerIn(ids.circleB), { title: 'Temporary wish' }),
    );
    const actorB = ownerIn(ids.circleB);
    await db.withActor(actorB, (tx) => linkRegistryItem(tx, actorB, extra.id, ids.circleB));
    await db.withActor(actorB, (tx) => unlinkRegistryItem(tx, actorB, extra.id, ids.circleB));
    const view = await db.withActor(actorB, (tx) => ownerCircleView(tx, ids.circleB));
    expect(view?.items.map((i) => i.title)).not.toContain('Temporary wish');
    const kept = await db.prisma.registryItem.findUnique({ where: { id: extra.id } });
    expect(kept?.title).toBe('Temporary wish');
  });
});

describe('the circles dashboard', () => {
  it('shows the receiver owned + member circles and no money state', async () => {
    const dashboard = await loadDashboard(
      db,
      { userId: ids.receiver, circleId: ids.circleA, role: 'owner', expiresAt: new Date(Date.now() + 3600_000) },
    );
    expect(dashboard?.owned.map((c) => c.shareSlug).sort()).toEqual([slugA, slugB].sort());
    expect(dashboard?.forOthers.map((c) => c.shareSlug)).toEqual([slugC, slugPlanned]);
    expect(dashboard?.registry?.map((i) => i.title)).toContain('Shared espresso machine');
    expect(JSON.stringify(dashboard)).not.toContain('pool');
    const html = renderToStaticMarkup(createElement(DashboardScreen, { view: dashboard!, basePath: '' }));
    expect(html).toContain('Gifts for you');
    expect(html).toContain('Gifts for others');
    expect(html).toContain('My registry');
    expect(html.toLowerCase()).not.toMatch(/claim|pool|contribut/);
  });

  it('shows a friend member circles only, never the registry', async () => {
    const dashboard = await loadDashboard(
      db,
      { userId: ids.friend, circleId: ids.circleA, role: 'friend', expiresAt: new Date(Date.now() + 3600_000) },
    );
    expect(dashboard?.owned).toEqual([]);
    // A, B, and the proxy circle, where the friend is a plain member: every
    // listed circle is one the viewer can open.
    expect(dashboard?.forOthers.map((c) => c.shareSlug).sort()).toEqual([slugA, slugB, slugP].sort());
    expect(dashboard?.registry).toBeNull();
    const html = renderToStaticMarkup(createElement(DashboardScreen, { view: dashboard!, basePath: '' }));
    expect(html).not.toContain('My registry');
    expect(html).toContain('Gifts for you');
    expect(html).toContain('No circles where you are the recipient yet.');
    expect(html).toContain('Gifts for others');
  });

  it('answers null without a session', async () => {
    expect(await loadDashboard(db, null)).toBeNull();
  });
});
