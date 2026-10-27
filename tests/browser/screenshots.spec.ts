import { mkdirSync } from 'node:fs';
import { test, type BrowserContext } from '@playwright/test';
import { issueSession, SESSION_COOKIE } from '../../src/server/auth/session';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * Opt-in screenshot strip capture (docs/plans/public-landing-page.md): the landing page's
 * strip is a committed build artefact of the fictional cast, never a live render. Run with
 * SCREENSHOTS=1 pnpm test:browser tests/browser/screenshots.spec.ts after seeding, then
 * commit the PNGs under public/screenshots/. Skipped in the normal suite — a capture that
 * rewrites public assets has no business running as a test assertion.
 */
let fixture: CircleFixture;
let path: string;

test.beforeAll(async () => {
  mkdirSync('public/screenshots', { recursive: true });
  fixture = await seedCircle(process.env.DATABASE_URL_TEST!);
  const circle = await fixture.db.prisma.circle.findUniqueOrThrow({ where: { id: fixture.circleId } });
  path = `/c/${circle.shareSlug}`;
});
test.afterAll(async () => {
  if (!fixture) return;
  await fixture.db.prisma.circle.deleteMany({ where: { id: { in: [fixture.circleId, fixture.otherCircleId] } } });
  await fixture.db.prisma.user.deleteMany({ where: { id: { in: [fixture.ownerUserId, fixture.friendAUserId, fixture.friendBUserId, fixture.outsiderUserId] } } });
  await fixture.db.disconnect();
});

async function authenticate(context: BrowserContext, role: 'owner' | 'friend', userId = role === 'owner' ? fixture.ownerUserId : fixture.friendAUserId) {
  await context.addCookies([{
    name: SESSION_COOKIE, value: issueSession({ role, userId, circleId: fixture.circleId }),
    url: 'http://127.0.0.1:3001', httpOnly: true, sameSite: 'Lax',
  }]);
}

test('captures the landing and both projections for the public strip', async ({ page, context }) => {
  test.skip(process.env.SCREENSHOTS !== '1', 'screenshot capture is opt-in (SCREENSHOTS=1)');
  await page.goto('/');
  await page.screenshot({ path: 'public/screenshots/landing.png' });

  await authenticate(context, 'owner');
  await page.goto(path);
  await page.screenshot({ path: 'public/screenshots/owner-ledger.png' });

  await context.clearCookies();
  await authenticate(context, 'friend');
  await page.goto(path);
  await page.screenshot({ path: 'public/screenshots/friend-ledger.png' });

  await page.goto(`${path}/items/${fixture.itemOwnId}`);
  await page.screenshot({ path: 'public/screenshots/item-detail.png' });

  await page.goto(`${path}/items/${fixture.itemGoneId}/card`);
  await page.screenshot({ path: 'public/screenshots/gift-card.png' });
});
