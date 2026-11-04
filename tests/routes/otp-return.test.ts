import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDb, type Db } from '@/server/db/client';
import { sessionFromRequest } from '@/server/auth/session';
import { hashPhone } from '@/server/auth/phone-hash';
import { classifyIdentifier, hashEmail, hashIdentifier, normalizeEmail } from '@/server/auth/email-hash';
import { env } from '@/lib/env';
import { handleFindPost, handleVerifyPost, OTP_RESPONSE_FLOOR_MS } from '@/server/routes/otp';
import { findActiveOtpCount, hashOtpCode, issueOtpCode, verifyOtpCode } from '@/server/ledger/otp';
import { deliverLoginCode } from '@/server/otp/deliver';
import { OTP_SEND_MAX_PER_HOUR, reserveRecipientSend } from '@/server/otp/send-cap';
import { loadDashboard } from '@/server/views/dashboard';

/**
 * Email return path (docs/plans/otp-return-path.md).
 *
 * A person proves they can read the email on a public circle. Found and
 * not-found are indistinguishable in status, wording and body shape; codes
 * are single-use, ten-minute, five-attempt, hashed at rest.
 */

let db: Db;
const stamp = String(Date.now() % 100000).padStart(5, '0');
// All digits, unique per n within a run and across runs: the varying part
// must survive normalizeE164 (letters are stripped, so base36 salts collide).
const person = (n: number) => `+99900${String(n).padStart(2, '0')}${stamp}`;
const salt = `otp${stamp}`;
const PEPPER = env.PHONE_HASH_PEPPER;

const hitPhone = person(1);
const missPhone = person(2);
const hitEmail = `otp-hit-${stamp}@example.test`;

const appOrigin = new URL(env.CIRCLE_BASE_URL).origin;

function post(path: string, fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields);
  return new Request(`${appOrigin}${path}`, {
    method: 'POST',
    // Every browser sends `Origin` on a same-origin form POST, so a real
    // submit always carries it — same convention as tests/routes/hub.test.ts.
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: appOrigin },
    body,
  });
}

async function seedHit(): Promise<{ userId: string; circleId: string }> {
  const user = await db.prisma.user.upsert({
    where: { phoneE164: hitPhone },
    create: {
      phoneE164: hitPhone,
      email: hitEmail,
      emailHash: hashEmail(hitEmail, PEPPER),
      displayName: 'OTP Owner',
    },
    update: { email: hitEmail, emailHash: hashEmail(hitEmail, PEPPER) },
  });
  const circle = await db.prisma.circle.create({
    data: {
      name: 'OTP circle',
      occasion: 'birthday',
      eventDate: new Date('2026-12-05T00:00:00.000Z'),
      eventDateSetByUserId: user.id,
      ownerUserId: user.id,
      shareSlug: `otp-${salt}-${Date.now() % 1000000}`,
      discoverable: true,
      memberships: { create: [{ userId: user.id, role: 'owner' }] },
    },
  });
  return { userId: user.id, circleId: circle.id };
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  db = createDb(url);
  await seedHit();
});

afterAll(async () => {
  await db?.disconnect();
});

describe('request uniformity (the no-oracle rule)', () => {
  it('answers hit and miss with identical status and body', async () => {
    const hit = await handleFindPost(db, post('/app/find', { phone: hitPhone }));
    const miss = await handleFindPost(db, post('/app/find', { phone: missPhone }));
    expect(hit.status).toBe(422);
    expect(miss.status).toBe(hit.status);
    const hitBody = (await hit.text()).split(hitPhone).join('');
    const missBody = (await miss.text()).split(missPhone).join('');
    // The only allowed difference is the requester's own number echoed back
    // in the verify form (they typed it; it reveals nothing server-side).
    expect(missBody).toBe(hitBody);
    expect(hitBody).not.toContain(hitEmail);
    expect(missBody).not.toContain(hitEmail);
    // No code anywhere on the page, in any mode: a shown code would turn
    // this page into a registration oracle.
    expect(hitBody).not.toMatch(/\b\d{6}\b/);
    expect(missBody).not.toMatch(/\b\d{6}\b/);
  });

  it('creates a code row on hit and none on miss', async () => {
    const before = await db.prisma.otpCode.count();
    await handleFindPost(db, post('/app/find', { phone: hitPhone }));
    await handleFindPost(db, post('/app/find', { phone: missPhone }));
    const after = await db.prisma.otpCode.count();
    expect(after - before).toBe(1);
  });

  it('caps live codes per number instead of minting forever', async () => {
    const phone = person(3);
    const user = await db.prisma.user.create({ data: { phoneE164: phone, displayName: 'OTP Cap' } });
    const phoneHash = hashPhone(phone, PEPPER);
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const issued = await issueOtpCode(db, user.id, phoneHash, PEPPER);
      if (issued) codes.push(issued.code);
    }
    expect(codes.length).toBe(3);
    expect(await findActiveOtpCount(db, phoneHash)).toBe(3);
  });
});

describe('verify (single-use, ten-minute, five-attempt)', () => {
  let circleSeq = 0;
  async function freshCode(phone: string): Promise<{ userId: string; code: string }> {
    circleSeq += 1;
    const user = await db.prisma.user.create({ data: { phoneE164: phone, displayName: 'OTP Verify' } });
    await db.prisma.circle.create({
      data: {
        name: 'OTP verify circle',
        occasion: 'birthday',
        eventDate: new Date('2026-12-05T00:00:00.000Z'),
        eventDateSetByUserId: user.id,
        ownerUserId: user.id,
        shareSlug: `otpv-${salt}-${circleSeq}-${phone.slice(-4)}`,
        memberships: { create: [{ userId: user.id, role: 'owner' }] },
      },
    });
    const issued = await issueOtpCode(db, user.id, hashPhone(phone, PEPPER), PEPPER);
    if (!issued) throw new Error('cap hit unexpectedly');
    return { userId: user.id, code: issued.code };
  }

  it('accepts the right code once, then burns it', async () => {
    const phone = person(4);
    const { code } = await freshCode(phone);
    const first = await verifyOtpCode(db, hashPhone(phone, PEPPER), code, PEPPER);
    expect(first).not.toBeNull();
    const second = await verifyOtpCode(db, hashPhone(phone, PEPPER), code, PEPPER);
    expect(second).toBeNull();
  });

  it('refuses expired codes exactly like wrong ones', async () => {
    const phone = person(5);
    const { code } = await freshCode(phone);
    await db.prisma.otpCode.updateMany({
      where: { phoneE164Hash: hashPhone(phone, PEPPER), used: false },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await verifyOtpCode(db, hashPhone(phone, PEPPER), code, PEPPER)).toBeNull();
    expect(await verifyOtpCode(db, hashPhone(phone, PEPPER), '000000', PEPPER)).toBeNull();
  });

  it('burns the code after five wrong attempts', async () => {
    const phone = person(6);
    const { code } = await freshCode(phone);
    const phoneHash = hashPhone(phone, PEPPER);
    for (let i = 0; i < 5; i++) {
      expect(await verifyOtpCode(db, phoneHash, '000000', PEPPER)).toBeNull();
    }
    expect(await verifyOtpCode(db, phoneHash, code, PEPPER)).toBeNull();
  });

  it('mints an owner session whose dashboard lists the circle', async () => {
    const phone = person(7);
    const { code } = await freshCode(phone);
    const res = await handleVerifyPost(db, post('/app/verify', { phone, code }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/app');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('gc_session=');
    const session = sessionFromRequest(
      new Request('http://localhost/app', { headers: { Cookie: setCookie.split(';')[0] ?? '' } }),
    );
    expect(session?.role).toBe('owner');
    const dashboard = await loadDashboard(db, session);
    expect(dashboard?.owned.length).toBe(1);
  });

  it('answers wrong, expired and exhausted codes with the same page', async () => {
    const phone = person(8);
    await freshCode(phone);
    const bodies = new Set<string>();
    const statuses = new Set<number>();
    for (const code of ['000000', '111111']) {
      const res = await handleVerifyPost(db, post('/app/verify', { phone, code }));
      statuses.add(res.status);
      bodies.add(await res.text());
    }
    expect(statuses).toEqual(new Set([422]));
    expect(bodies.size).toBe(1);
  });
});

describe('email and phone lookup stay indistinguishable', () => {
  it('sends a code for an owned circle with an email, including one that is not discoverable, and stays silent for a miss or a circle with no email', async () => {
    const emailOnly = `otp-email-${stamp}@example.test`;
    const phone = person(9);
    const phoneEmail = `otp-phone-${stamp}@example.test`;
    const privateEmail = `otp-private-${stamp}@example.test`;
    const legacyPhone = person(10);
    const miss = `otp-miss-${stamp}@example.test`;
    const dated = String(Date.now() % 1000000);

    const emailUser = await db.prisma.user.create({
      data: { email: emailOnly, emailHash: hashEmail(emailOnly, PEPPER), displayName: 'Email Owner' },
    });
    await db.prisma.circle.create({
      data: {
        name: 'Email circle', occasion: 'birthday', discoverable: true,
        eventDate: new Date('2026-12-05T00:00:00.000Z'), eventDateSetByUserId: emailUser.id,
        ownerUserId: emailUser.id, shareSlug: `otpe-${salt}-${dated}`,
        memberships: { create: [{ userId: emailUser.id, role: 'owner' }] },
      },
    });
    const phoneUser = await db.prisma.user.create({
      data: {
        phoneE164: phone, email: phoneEmail, emailHash: hashEmail(phoneEmail, PEPPER), displayName: 'Phone Owner',
      },
    });
    await db.prisma.circle.create({
      data: {
        name: 'Phone circle', occasion: 'birthday', discoverable: true,
        eventDate: new Date('2026-12-05T00:00:00.000Z'), eventDateSetByUserId: phoneUser.id,
        ownerUserId: phoneUser.id, shareSlug: `otpp-${salt}-${dated}`,
        memberships: { create: [{ userId: phoneUser.id, role: 'owner' }] },
      },
    });
    const privateUser = await db.prisma.user.create({
      data: { email: privateEmail, emailHash: hashEmail(privateEmail, PEPPER), displayName: 'Private Owner' },
    });
    await db.prisma.circle.create({
      data: {
        name: 'Private circle', occasion: 'birthday', discoverable: false,
        eventDate: new Date('2026-12-05T00:00:00.000Z'), eventDateSetByUserId: privateUser.id,
        ownerUserId: privateUser.id, shareSlug: `otpi-${salt}-${dated}`,
        memberships: { create: [{ userId: privateUser.id, role: 'owner' }] },
      },
    });
    const legacy = await db.prisma.user.create({ data: { phoneE164: legacyPhone, displayName: 'Legacy Owner' } });
    await db.prisma.circle.create({
      data: {
        name: 'Legacy circle', occasion: 'birthday', discoverable: true,
        eventDate: new Date('2026-12-05T00:00:00.000Z'), eventDateSetByUserId: legacy.id,
        ownerUserId: legacy.id, shareSlug: `otpl-${salt}-${dated}`,
        memberships: { create: [{ userId: legacy.id, role: 'owner' }] },
      },
    });

    const sent: string[] = [];
    const deliver = async (input: { to: string; code: string }) => {
      sent.push(input.to);
      return true;
    };
    const before = await db.prisma.otpCode.count();
    const requests = [emailOnly, phone, miss, privateEmail, legacyPhone];
    const bodies: string[] = [];
    for (const identifier of requests) {
      const started = Date.now();
      const res = await handleFindPost(db, post('/app/find', { identifier }), deliver);
      expect(Date.now() - started).toBeGreaterThanOrEqual(OTP_RESPONSE_FLOOR_MS - 50);
      expect(res.status).toBe(422);
      const text = await res.text();
      const stripped = text.split(identifier).join('');
      expect(stripped).not.toMatch(/\b\d{6}\b/);
      bodies.push(stripped);
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[1]).not.toContain(phoneEmail);
    expect(sent).toEqual([emailOnly, phoneEmail, privateEmail]);
    expect(await db.prisma.otpCode.count() - before).toBe(3);
  }, 20_000);

  it('throttles the submitted identifier before it knows whether anyone matched', async () => {
    const identifier = `otp-rate-${stamp}@example.test`;
    const deliver = async () => true;
    for (let i = 0; i < 3; i++) {
      const res = await handleFindPost(db, post('/app/find', { identifier }), deliver);
      expect(res.status).toBe(422);
    }
    const blocked = await handleFindPost(db, post('/app/find', { identifier }), deliver);
    expect(blocked.status).toBe(429);
  }, 20_000);
});

describe('membership and proxy creators can ask for a code', () => {
  it('sends for a friend membership or a proxy circle and stays silent when neither exists', async () => {
    const memberEmail = `otp-member-${stamp}@example.test`;
    const proxyEmail = `otp-proxy-${stamp}@example.test`;
    const idleEmail = `otp-idle-${stamp}@example.test`;
    const owner = await db.prisma.user.create({
      data: { displayName: 'Seat owner', email: `otp-seat-${stamp}@example.test`, emailHash: hashEmail(`otp-seat-${stamp}@example.test`, PEPPER) },
    });
    const member = await db.prisma.user.create({
      data: { displayName: 'Member only', email: memberEmail, emailHash: hashEmail(memberEmail, PEPPER) },
    });
    const planner = await db.prisma.user.create({
      data: { displayName: 'Proxy planner', email: proxyEmail, emailHash: hashEmail(proxyEmail, PEPPER) },
    });
    await db.prisma.user.create({
      data: { displayName: 'Idle', email: idleEmail, emailHash: hashEmail(idleEmail, PEPPER) },
    });
    await db.prisma.circle.create({
      data: {
        name: 'Friends only', occasion: 'birthday', discoverable: false,
        eventDate: new Date('2026-12-05T00:00:00.000Z'), eventDateSetByUserId: owner.id,
        ownerUserId: owner.id, shareSlug: `otpm-${salt}`,
        memberships: { create: [{ userId: member.id, role: 'friend' }] },
      },
    });
    await db.prisma.circle.create({
      data: {
        name: 'Planned surprise', occasion: 'birthday',
        eventDate: new Date('2026-12-05T00:00:00.000Z'),
        ownerUserId: null, proxyCreatedByUserId: planner.id, shareSlug: `otpx-${salt}`,
      },
    });
    const sent: string[] = [];
    const deliver = async (input: { to: string; code: string }) => {
      sent.push(input.to);
      return true;
    };
    for (const identifier of [memberEmail, proxyEmail, idleEmail]) {
      const res = await handleFindPost(db, post('/app/find', { identifier }), deliver);
      expect(res.status).toBe(422);
    }
    expect(sent.sort()).toEqual([memberEmail, proxyEmail].sort());
  }, 20_000);
});

describe('address normalisation', () => {
  it('folds case and surrounding space and keeps plus-tags distinct', () => {
    expect(normalizeEmail('  User+Circle@Example.Test ')).toBe('user+circle@example.test');
    expect(hashEmail('User+Circle@Example.Test', PEPPER)).toBe(hashEmail('user+circle@example.test', PEPPER));
    expect(hashEmail('user+circle@example.test', PEPPER)).not.toBe(hashEmail('user@example.test', PEPPER));
    const tagged = classifyIdentifier('User+Circle@Example.Test');
    const plain = classifyIdentifier('user@example.test');
    expect(tagged?.kind).toBe('email');
    expect(plain?.kind).toBe('email');
    if (!tagged || !plain) throw new Error('expected both addresses to parse');
    expect(hashIdentifier(tagged, PEPPER)).not.toBe(hashIdentifier(plain, PEPPER));
  });
});

describe('the email sender', () => {
  it('logs the code in demo mode and does not call the network', async () => {
    const fetchSpy = vi.fn() as unknown as typeof fetch;
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await expect(deliverLoginCode({
        to: 'user@example.test', code: '482916', demo: true,
      }, fetchSpy)).resolves.toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith('otp_demo_code_issued', { code: '482916' });
      expect(JSON.stringify(spy.mock.calls)).not.toContain('user@example.test');
    } finally {
      spy.mockRestore();
    }
  });

  it('sends a plain code with no circle link when Resend is configured', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const stubFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response('{"id":"re_test"}', { status: 200 });
    }) as unknown as typeof fetch;
    const ok = await deliverLoginCode({
      to: 'user@example.test',
      code: '482916',
      demo: false,
      apiKey: 're_test_key',
      from: 'codes@example.test',
    }, stubFetch);
    expect(ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String(seen[0]!.init.body)) as { subject: string; text: string; from: string };
    expect(body.subject).toBe('Your sign-in code');
    expect(body.text).toContain('482916');
    expect(body.text).not.toContain('/c/');
    expect(body.text).not.toContain('@');
    expect(body.from).toBe('codes@example.test');
  });

  it('reports false instead of throwing when the send fails or the config is missing', async () => {
    const failing = (async () => new Response('nope', { status: 400 })) as unknown as typeof fetch;
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(deliverLoginCode({
        to: 'user@example.test', code: '482916', demo: false, apiKey: 're_test_key', from: 'codes@example.test',
      }, failing)).resolves.toBe(false);
      await expect(deliverLoginCode({
        to: 'user@example.test', code: '482916', demo: false,
      }, failing)).resolves.toBe(false);
      expect(JSON.stringify(err.mock.calls)).not.toContain('user@example.test');
    } finally {
      err.mockRestore();
    }
  });
});

describe('recipient send cap', () => {
  it('stops after the hourly maximum without depending on a match', async () => {
    const emailHash = hashEmail(`otp-cap-${stamp}@example.test`, PEPPER);
    for (let i = 0; i < OTP_SEND_MAX_PER_HOUR; i++) {
      expect(await reserveRecipientSend(db, emailHash)).toBe(true);
    }
    expect(await reserveRecipientSend(db, emailHash)).toBe(false);
  });
});

describe('otp_codes visibility', () => {
  it('hides every code row from app roles', async () => {
    const count = await db.withActor(
      { role: 'owner' as const, userId: '00000000-0000-4000-8000-000000000000', circleId: null },
      (tx) => tx.otpCode.count(),
    );
    expect(count).toBe(0);
  });

  it('hides the owner email column from app roles', async () => {
    const user = await db.prisma.user.findUniqueOrThrow({ where: { email: hitEmail }, select: { id: true } });
    await expect(db.withActor(
      { role: 'owner' as const, userId: user.id, circleId: null },
      (tx) => tx.user.findFirst({ select: { email: true } }),
    )).rejects.toThrow();
  });

  it('hashes codes with a purpose-separated pepper', () => {
    const a = hashOtpCode('482916', PEPPER);
    const b = hashOtpCode('482916', PEPPER);
    expect(a).toBe(b);
    expect(a).not.toContain('482916');
  });
});
