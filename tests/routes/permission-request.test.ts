import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Db } from '@/server/db/client';
import { env } from '@/lib/env';
import { handleCircleGet, handleCirclePost } from '@/server/routes/circle';
import { ownerCircleView, friendCircleView } from '@/server/views';
import { issueSession, SESSION_COOKIE } from '@/server/auth/session';
import { seedCircle, type CircleFixture } from '../leak/fixtures';
import { handleLookupPost } from '@/server/routes/lookup';

/**
 * RN-J: a refused visitor can ask for access; the request is found by the
 * owner in their own projection, never sent. A pending request is not an
 * invitation: the gate refuses it until the owner approves, and approval is
 * idempotent. Generated numbers only: this repo is public.
 */

let fx: CircleFixture;
let db: Db;
let slug: string;
const origin = new URL(env.CIRCLE_BASE_URL).origin;
const suffix = String(Math.floor(10000 + Math.random() * 90000));
const num = (n: number) => `+2783${suffix}${String(n).padStart(2, '0')}`;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  fx = await seedCircle(url);
  db = fx.db;
  const circle = await db.prisma.circle.findUnique({ where: { id: fx.circleId }, select: { shareSlug: true } });
  slug = circle!.shareSlug;
});

afterAll(async () => {
  await db?.disconnect();
});

function post(path: string, fields: Record<string, string>, cookie?: string): Promise<Response> {
  return handleCirclePost(db, new Request(`${origin}/c/${slug}${path}`, {
    method: 'POST',
    headers: {
      origin, 'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(fields),
  }), slug);
}

const ownerCookie = () => `${SESSION_COOKIE}=${issueSession({ role: 'owner', userId: fx.ownerUserId, circleId: fx.circleId })}`;
const friendCookie = () => `${SESSION_COOKIE}=${issueSession({ role: 'friend', userId: fx.friendAUserId, circleId: fx.circleId })}`;

const REQUESTER = num(61);

it('records a request, answers with the ordinary gate no, and does not let the requester in', async () => {
  const requesterPhone = REQUESTER;
  const denied = await post('', { name: 'Stranger Friend', phone: num(62) });
  const asked = await post('', { intent: 'request_access', name: 'Stranger Friend', phone: requesterPhone });
  expect(asked.status).toBe(denied.status);
  expect(await asked.text()).toBe(await denied.text());

  const row = await db.prisma.allowlistEntry.findFirst({
    where: { circleId: fx.circleId, requesterName: 'Stranger Friend' },
  });
  expect(row?.status).toBe('pending');

  // The pending request is not an invitation.
  const gate = await post('', { name: 'Stranger Friend', phone: requesterPhone });
  expect(gate.status).toBe(200);
  expect(gate.headers.get('Set-Cookie')).toBeNull();
});

it('shows the request in the owner projection only, never the friend projection', async () => {
  const asOwner = await db.withActor(
    { role: 'owner', userId: fx.ownerUserId, circleId: fx.circleId },
    (tx) => ownerCircleView(tx, fx.circleId),
  );
  expect(asOwner?.accessRequests.map((r) => r.requesterName)).toContain('Stranger Friend');

  const ownerPage = await handleCircleGet(
    db, new Request(`${origin}/c/${slug}`, { headers: { cookie: ownerCookie() } }), slug,
  );
  expect(await ownerPage.text()).toContain('Stranger Friend');

  const asFriend = await db.withActor(
    { role: 'friend', userId: fx.friendAUserId, circleId: fx.circleId },
    (tx) => friendCircleView(tx, fx.circleId, fx.friendAUserId),
  );
  expect(JSON.stringify(asFriend)).not.toContain('Stranger Friend');

  const friendPage = await handleCircleGet(
    db, new Request(`${origin}/c/${slug}`, { headers: { cookie: friendCookie() } }), slug,
  );
  expect(await friendPage.text()).not.toContain('Stranger Friend');
});

it('approval turns the request into an invitation the gate honours; approval is idempotent', async () => {
  const row = await db.prisma.allowlistEntry.findFirst({
    where: { circleId: fx.circleId, requesterName: 'Stranger Friend' },
  });
  const decided = await post('/requests', { intent: 'accept', requestId: row!.id }, ownerCookie());
  expect(decided.status).toBe(303);
  const again = await post('/requests', { intent: 'accept', requestId: row!.id }, ownerCookie());
  expect(again.status).toBe(303);

  const stored = await db.prisma.allowlistEntry.findUnique({ where: { id: row!.id } });
  expect(stored?.requesterName).toBeNull();
  expect(stored?.status).toBe('pending');

  // The previously refused number now passes the gate.
  const gate = await post('', { name: 'Stranger Friend', phone: REQUESTER });
  expect(gate.status).toBe(303);
  expect(gate.headers.get('Set-Cookie')).toContain(SESSION_COOKIE);
});

it('on a proxy circle there is nobody to ask: same answer, no request row', async () => {
  const created = await handleLookupPost(db, new Request('http://localhost/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      intent: 'create', creatorName: 'Creator Friend', creatorPhone: num(64),
      recipientPhone: num(65), recipientLabel: 'A Friend', occasion: 'birthday',
      eventDate: '2026-12-05', itemTitle: 'Trail runners',
    }),
  }));
  expect(created.status).toBe(303);
  const proxySlug = decodeURIComponent((created.headers.get('Location') ?? '').slice(3));
  const before = await db.prisma.allowlistEntry.count({
    where: { circle: { shareSlug: proxySlug }, requesterName: { not: null } },
  });
  const asked = await handleCirclePost(db, new Request(`${origin}/c/${proxySlug}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ intent: 'request_access', name: 'Hopeful Friend', phone: num(66) }),
  }), proxySlug);
  expect(asked.status).toBe(200);
  const after = await db.prisma.allowlistEntry.count({
    where: { circle: { shareSlug: proxySlug }, requesterName: { not: null } },
  });
  expect(after).toBe(before);
});

it('a friend cannot decide requests, and expired requests leave the owner inbox', async () => {
  const asked = await post('', { intent: 'request_access', name: 'Late Friend', phone: num(63) });
  expect(asked.status).toBe(200);
  const row = await db.prisma.allowlistEntry.findFirst({
    where: { circleId: fx.circleId, requesterName: 'Late Friend' },
  });
  const byFriend = await post('/requests', { intent: 'accept', requestId: row!.id }, friendCookie());
  expect(byFriend.status).toBe(404);

  await db.prisma.allowlistEntry.update({
    where: { id: row!.id },
    data: { createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
  });
  const asOwner = await db.withActor(
    { role: 'owner', userId: fx.ownerUserId, circleId: fx.circleId },
    (tx) => ownerCircleView(tx, fx.circleId),
  );
  expect(asOwner?.accessRequests.map((r) => r.requesterName)).not.toContain('Late Friend');
});
