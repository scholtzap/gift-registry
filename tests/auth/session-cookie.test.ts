import { expect, it } from 'vitest';
import { clearSessionCookie, issueSession, readSession, sessionCookie } from '@/server/auth/session';

/**
 * Session cookie flags (prior review gap, now pinned): HttpOnly always,
 * SameSite=Lax (the link arrives as a top-level GET from WhatsApp's in-app
 * browser; Strict would drop the cookie), Secure in production only, 14-day
 * expiry. Login-CSRF is enforced separately per issuer (isSameOrigin), since
 * Lax alone cannot protect a session-minting POST.
 */

const userId = '123e4567-e89b-42d3-a456-426614174000';
const circleId = '123e4567-e89b-42d3-a456-426614174001';

it('mints a readable session and flags the cookie HttpOnly + Lax + Path', () => {
  const token = issueSession({ userId, circleId, role: 'friend' });
  expect(readSession(token)).toMatchObject({ userId, circleId, role: 'friend' });
  const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const header = sessionCookie(token, expiry);
  expect(header).toContain('gc_session=');
  expect(header).toContain('Path=/');
  expect(header).toContain('HttpOnly');
  expect(header).toContain('SameSite=Lax');
  expect(header).toContain(`Expires=${expiry.toUTCString()}`);
  // Test env is not production; production adds Secure (session.ts).
  expect(header).not.toContain('Secure');
});

it('clears with an expired Lax cookie', () => {
  const cleared = clearSessionCookie();
  expect(cleared).toContain('gc_session=;');
  expect(cleared).toContain('SameSite=Lax');
  expect(cleared).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
});
