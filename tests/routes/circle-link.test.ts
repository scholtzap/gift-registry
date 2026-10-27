import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/server/db/client';
import { handleCircleGet, handleCirclePost } from '@/server/routes/circle';
import { issueSession, readSession, SESSION_COOKIE } from '@/server/auth/session';
import { hashPhone } from '@/server/auth/phone-hash';
import { env } from '@/lib/env';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * The route-level rows of the ARCHITECTURE §8 matrix. `tests/leak` proves RLS decides which
 * rows exist and `tests/views` proves the builders decide which columns are rendered; this
 * suite proves the HTTP layer does not undo either of them. Three things are load-bearing here
 * and none of them are styling:
 *
 * - `/c/<slug>` resolves. It is pasted into a WhatsApp group and it never moves, so a test
 *   asserts it rather than a person remembering it.
 * - One URL, two projections. The owner's body must not merely omit the group's activity, it
 *   must have no shape a claim could arrive in — which is why the assertions are on absence of
 *   substrings and not on a count.
 * - Nothing here is cacheable. The same URL answers differently per role, so a shared cache is
 *   a cross-role leak that no amount of RLS can catch.
 */

let fx: CircleFixture;
let db: Db;
let slug: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  fx = await seedCircle(url);
  db = fx.db;
  const circle = await db.prisma.circle.findUnique({ where: { id: fx.circleId }, select: { shareSlug: true } });
  if (!circle) throw new Error('fixture circle vanished');
  slug = circle.shareSlug;
});

afterAll(async () => {
  await db?.disconnect();
});

const appOrigin = new URL(env.CIRCLE_BASE_URL).origin;
const url = (s = slug) => `${appOrigin}/c/${s}`;

// Generated per run rather than written down: this repo is public, and a committed number — even a
// fake-looking one — is a number someone may be assigned. Nothing here is dialled or stored as
// digits; only its keyed hash reaches the allowlist, which is the shape a real invite has. The
// `+999` prefix is padding to a length `normalizeE164` accepts.
const syntheticPhone = () => `+999${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

const cookieFor = (input: { userId: string; circleId?: string; role: 'owner' | 'friend' }) =>
  `${SESSION_COOKIE}=${issueSession({ userId: input.userId, circleId: input.circleId ?? fx.circleId, role: input.role })}`;

const get = (s: string, cookie?: string) =>
  handleCircleGet(db, new Request(url(s), cookie ? { headers: { cookie } } : {}), s);

const post = (s: string, fields: Record<string, string>, origin = appOrigin) =>
  handleCirclePost(
    db,
    new Request(url(s), {
      method: 'POST',
      // Every browser sends `Origin` on a same-origin form POST, so a real submit always carries it.
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
      body: new URLSearchParams(fields).toString(),
    }),
    s,
  );

const postWithoutOrigin = (s: string, fields: Record<string, string>, headers: Record<string, string> = {}) =>
  handleCirclePost(
    db,
    new Request(url(s), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(fields).toString(),
    }),
    s,
  );

describe('the circle link', () => {
  it('loads the Piñata stylesheet at the unauthenticated gate without disclosing the circle', async () => {
    const res = await get(slug);
    const body = await res.text();
    expect(body).toContain('Piñata');
    expect(body).toContain('href="/pinata.css"');
    expect(body).not.toContain(slug);
    expect(body).not.toContain('Trail runners');
  });

  it('renders actor-private settings at the circle settings URL', async () => {
    const res = await handleCircleGet(
      db,
      new Request(`${url(slug)}/settings`, { headers: { cookie: cookieFor({ userId: fx.friendAUserId, role: 'friend' }) } }),
      slug,
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('AI capabilities');
    expect(body).toContain('voice_transcribe');
    expect(body).not.toContain('Same shoe');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('resolves for the owner, which is the rule that never moves', async () => {
    const res = await get(slug, cookieFor({ userId: fx.ownerUserId, role: 'owner' }));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Naledi&#39;s 30th");
    expect(body).toContain('Trail runners');
  });

  it('answers the same URL differently per role', async () => {
    const asOwner = await (await get(slug, cookieFor({ userId: fx.ownerUserId, role: 'owner' }))).text();
    const asFriend = await (await get(slug, cookieFor({ userId: fx.friendAUserId, role: 'friend' }))).text();

    expect(asOwner).not.toEqual(asFriend);
    // The friend projection carries the secret suggestion, the tombstone and the money.
    expect(asFriend).toContain('Same shoe, R3 400 cheaper elsewhere');
    expect(asFriend).toContain('Coffee grinder');
    expect(asOwner).not.toContain('Same shoe');
    expect(asOwner).not.toContain('Coffee grinder');
  });

  it('gives the owner no surface a claim or a contribution could arrive in', async () => {
    const body = await (await get(slug, cookieFor({ userId: fx.ownerUserId, role: 'owner' }))).text();
    for (const forbidden of ['pool', 'claimed', 'contribut', 'Thabo', 'Lerato', 'Anonymous', 'Grind it fine']) {
      expect(body.toLowerCase(), `owner body mentioned ${forbidden}`).not.toContain(forbidden.toLowerCase());
    }
  });

  it('404s on a slug that does not exist, with no store and no hint', async () => {
    const res = await get('not-a-real-circle');
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store, max-age=0, must-revalidate');
    expect(await res.text()).not.toContain('Naledi');
  });

  it('404s rather than 403s for a signed session belonging to a real user who never joined', async () => {
    // The signature is valid and the role is honest. RLS is what says no, and the route's job
    // is to make "no" indistinguishable from "nothing here".
    const res = await get(slug, cookieFor({ userId: fx.outsiderUserId, role: 'friend' }));
    expect(res.status).toBe(404);
  });

  it('shows the gate, and no circle content, to a caller with no session', async () => {
    const res = await get(slug);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Join this circle');
    expect(body).not.toContain('Trail runners');
    expect(body).not.toContain('Naledi');
    // The slug is never echoed into the markup, so there is nothing to escape and nothing to
    // inject through a crafted link.
    expect(body).not.toContain(slug);
  });

  it('refuses to read a session that was minted for a different circle', async () => {
    // The forwarded-link bug: one valid cookie, used against someone else's group.
    const other = await db.prisma.circle.create({
      data: {
        name: 'Unrelated circle',
        occasion: 'birthday',
        eventDate: new Date('2027-01-01T00:00:00.000Z'),
        ownerUserId: fx.ownerUserId,
        shareSlug: `t-other-${fx.circleId.slice(0, 8)}`,
      },
    });
    const res = await get(slug, cookieFor({ userId: fx.friendAUserId, circleId: other.id, role: 'friend' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Join this circle');
  });

  it('shows the gate to a tampered cookie instead of failing open or throwing', async () => {
    const good = cookieFor({ userId: fx.friendAUserId, role: 'friend' });
    const token = good.slice(SESSION_COOKIE.length + 1);
    // Flip one payload character to something it is not already, so the token is genuinely
    // different on every run rather than only on the runs where position 12 is not 'B'.
    const at = 12;
    const flipped = `${token.slice(0, at)}${token[at] === 'B' ? 'C' : 'B'}${token.slice(at + 1)}`;
    expect(flipped).not.toBe(token);

    const res = await get(slug, `${SESSION_COOKIE}=${flipped}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Join this circle');
  });

  it('never lets any of these responses be cached', async () => {
    const responses = [
      await get(slug, cookieFor({ userId: fx.ownerUserId, role: 'owner' })),
      await get(slug, cookieFor({ userId: fx.friendAUserId, role: 'friend' })),
      await get(slug),
      await get('not-a-real-circle'),
    ];
    for (const res of responses) {
      expect(res.headers.get('Cache-Control')).toContain('no-store');
      expect(res.headers.get('Cache-Control')).toContain('private');
    }
  });
});

describe('the allowlist gate that mints a session', () => {
  async function invite(phone: string) {
    await db.prisma.allowlistEntry.create({
      data: { circleId: fx.circleId, phoneE164Hash: hashPhone(phone, env.SESSION_SECRET), addedBy: fx.ownerUserId },
    });
  }

  it('lets an invited number in, and the resulting cookie reads the friend projection', async () => {
    const phone = syntheticPhone();
    await invite(phone);

    const res = await post(slug, { name: 'Invited Friend', phone });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(`/c/${slug}`);

    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('SameSite=Strict');

    const token = setCookie!.split(';')[0]!;
    const follow = await get(slug, token);
    expect(follow.status).toBe(200);
    expect(await follow.text()).toContain('Trail runners');

    const membership = await db.prisma.membership.findFirst({
      where: { circleId: fx.circleId, user: { phoneE164: phone } },
      select: { role: true, status: true },
    });
    expect(membership).toEqual({ role: 'friend', status: 'active' });

    const entry = await db.prisma.allowlistEntry.findUnique({
      where: { circleId_phoneE164Hash: { circleId: fx.circleId, phoneE164Hash: hashPhone(phone, env.SESSION_SECRET) } },
      select: { status: true },
    });
    expect(entry?.status).toBe('accepted');
  });

  // SameSite=Lax cannot protect an endpoint that *issues* a cookie: a cross-site form POST is a
  // CORS-simple request with no preflight, and the browser accepts Set-Cookie from the response.
  // An attacker who knows an allow-listed number can therefore log their victim into the
  // attacker's own circle from the victim's browser, with a session that is genuinely the victim's
  // — invisible to RLS. These assertions pin the Origin check that does see it.
  it('refuses a cross-site post even when the number is allow-listed', async () => {
    const phone = syntheticPhone();
    await invite(phone);
    const before = await db.prisma.user.count();

    const res = await post(slug, { name: 'Victim Of Login CSRF', phone }, 'https://attacker.example.test');
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(await db.prisma.user.count()).toBe(before);
  });

  it('refuses a post that carries no Origin and no Referer', async () => {
    const phone = syntheticPhone();
    await invite(phone);

    const res = await postWithoutOrigin(slug, { name: 'Headerless', phone });
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('takes Referer as the fallback, and only when it names this origin', async () => {
    const phone = syntheticPhone();
    await invite(phone);

    const fromHere = await postWithoutOrigin(slug, { name: 'Referer Friend', phone }, {
      referer: url(slug),
    });
    expect(fromHere.status).toBe(303);

    const fromElsewhere = await postWithoutOrigin(slug, { name: 'Referer Attacker', phone }, {
      referer: 'https://evil.example.test/any-path',
    });
    expect(fromElsewhere.status).toBe(200);
    expect(fromElsewhere.headers.get('Set-Cookie')).toBeNull();
  });

  it('refuses a number that is not on the list without creating anyone', async () => {
    const phone = syntheticPhone();
    const before = await db.prisma.user.count();

    const res = await post(slug, { name: 'Not Invited', phone });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('could not let you in');
    // One message for every kind of no, so this form cannot be used to walk a phone list.
    expect(body).not.toContain('Not Invited');
    expect(body).not.toContain(phone);
    expect(await db.prisma.user.count()).toBe(before);
  });

  it('refuses a removed invite even though the hash still matches', async () => {
    const phone = syntheticPhone();
    await invite(phone);
    await db.prisma.allowlistEntry.update({
      where: { circleId_phoneE164Hash: { circleId: fx.circleId, phoneE164Hash: hashPhone(phone, env.SESSION_SECRET) } },
      data: { status: 'removed' },
    });

    const res = await post(slug, { name: 'Removed Friend', phone });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('could not let you in');
  });

  it('refuses a malformed number and a missing name', async () => {
    expect((await post(slug, { name: 'Someone', phone: '0820000000' })).status).toBe(200);
    expect((await post(slug, { name: '', phone: syntheticPhone() })).status).toBe(200);
    const res = await post(slug, { name: 'Someone', phone: '0820000000' });
    expect(await res.text()).toContain('full international form');
  });

  it('404s on a slug that does not exist rather than explaining the gate', async () => {
    expect((await post('not-a-real-circle', { name: 'Someone', phone: syntheticPhone() })).status).toBe(404);
  });
});

describe('the session token itself', () => {
  // Built inside each test, not at describe scope: describe bodies run during collection, before
  // `beforeAll` has seeded anything, so reading `fx` there is reading undefined.
  const actor = () => ({ userId: fx.friendAUserId, circleId: fx.circleId, role: 'friend' as const });

  it('round-trips', () => {
    const a = actor();
    const read = readSession(issueSession(a));
    expect(read).toMatchObject({ userId: a.userId, circleId: a.circleId, role: 'friend' });
  });

  it('rejects an expired token', () => {
    const then = Date.now() - 15 * 24 * 60 * 60 * 1000;
    expect(readSession(issueSession(actor(), then))).toBeNull();
  });

  it('rejects a payload whose role was swapped after signing', () => {
    const a = actor();
    const token = issueSession(a);
    const dot = token.indexOf('.');
    const sig = token.slice(dot + 1);
    const forged = Buffer.from(
      JSON.stringify({ v: 1, u: a.userId, c: a.circleId, r: 'owner', e: Math.floor(Date.now() / 1000) + 60 }),
      'utf8',
    ).toString('base64url');
    // A new payload with the old signature, and the old payload with a disturbed signature.
    // The disturbance goes on the FIRST signature character, not the last: a 32-byte HMAC is 43
    // base64url characters, so the 43rd carries only 4 real bits and the two low padding bits are
    // discarded on decode — 'A' and 'B' there are the same bytes, and flipping it verifies.
    expect(readSession(`${forged}.${sig}`)).toBeNull();
    const first = sig.slice(0, 1);
    expect(readSession(`${token.slice(0, dot)}.${first === 'A' ? 'B' : 'A'}${sig.slice(1)}`)).toBeNull();
  });

  it('rejects garbage without throwing', () => {
    for (const bad of ['', '.', 'a.b', '....', 'eyJ2IjoxfQ.notbase64!!']) {
      expect(readSession(bad)).toBeNull();
    }
    expect(readSession(undefined)).toBeNull();
  });
});
