import { test, expect, type BrowserContext } from '@playwright/test';
import { issueSession, SESSION_COOKIE } from '../../src/server/auth/session';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * The 3-minute demo loop, replayed before recording (docs/plans/demo-video-validation.md).
 * Every step asserts what the camera would see. Generated fictional numbers
 * only: this repo is public, and a fixture number is one keystroke from a
 * real subscriber.
 */

const suffix = String(Math.floor(10000 + Math.random() * 90000));
const num = (n: number) => `+2783${suffix}${String(n).padStart(2, '0')}`;

test('step 1-2: search a number, get the always-200 offer, create a proxy circle', async ({ page }) => {
  await page.goto('/lookup');
  await expect(page.getByRole('heading', { name: 'Buying a gift for someone?' })).toBeVisible();
  await page.getByLabel(/Their WhatsApp number/).fill(num(11));
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Start a gift circle for someone' })).toBeVisible();
  await page.getByLabel('Your name').fill('Demo Creator');
  await page.getByLabel(/Your number/).fill(num(12));
  await page.getByLabel(/Their number/).fill(num(13));
  await page.getByLabel(/Their name, as the group knows them/).fill('Demo Friend');
  await page.getByLabel('Occasion').fill('birthday');
  await page.getByLabel('The day').fill('2026-12-05');
  await page.getByLabel('The gift').fill('Demo trail runners');
  await page.getByRole('button', { name: 'Create the circle' }).click();

  await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{16,}$/);
  await expect(page.getByText('Demo trail runners')).toBeVisible();
});

test('step 4: the creator claims the gift on the proxy circle', async ({ page }) => {
  await page.goto('/lookup');
  await page.getByLabel(/Their WhatsApp number/).fill(num(21));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Your name').fill('Demo Creator');
  await page.getByLabel(/Your number/).fill(num(22));
  await page.getByLabel(/Their number/).fill(num(23));
  await page.getByLabel(/Their name, as the group knows them/).fill('Demo Friend');
  await page.getByLabel('Occasion').fill('birthday');
  await page.getByLabel('The day').fill('2026-12-05');
  await page.getByLabel('The gift').fill('Demo claimable gift');
  await page.getByRole('button', { name: 'Create the circle' }).click();
  await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{16,}$/);

  await page.getByRole('link', { name: /Demo claimable gift/ }).first().click();
  await page.getByRole('button', { name: 'I’ll buy it myself', exact: true }).click();
  await expect(page.getByText('You claimed this', { exact: true })).toBeVisible();
});

let fixture: CircleFixture;
let seededPath: string;

test.beforeAll(async () => {
  fixture = await seedCircle(process.env.DATABASE_URL_TEST!);
  const circle = await fixture.db.prisma.circle.findUniqueOrThrow({ where: { id: fixture.circleId } });
  seededPath = `/c/${circle.shareSlug}`;
});
test.afterAll(async () => {
  await fixture?.db.disconnect();
});

async function ownerContext(context: BrowserContext) {
  await context.addCookies([{
    name: SESSION_COOKIE,
    value: issueSession({ role: 'owner', userId: fixture.ownerUserId, circleId: fixture.circleId }),
    url: 'http://127.0.0.1:3001', httpOnly: true, sameSite: 'Lax',
  }]);
}

test('step 3: a friend asks, the owner finds it on their own link and lets them in', async ({ page, browser }) => {
  await page.goto(seededPath);
  await page.getByLabel('Your name').fill('Demo Asker');
  await page.getByLabel('WhatsApp number').fill(num(31));
  await page.getByRole('button', { name: 'Ask to be added' }).click();
  await expect(page.getByText('We could not let you in with that number.')).toBeVisible();

  const owner = await browser.newContext();
  await ownerContext(owner);
  const ownerPage = await owner.newPage();
  await ownerPage.goto(seededPath);
  await expect(ownerPage.getByText('Demo Asker')).toBeVisible();
  await ownerPage.getByRole('button', { name: 'Let them in' }).click();
  await owner.close();

  await page.getByLabel('Your name').fill('Demo Asker');
  await page.getByLabel('WhatsApp number').fill(num(31));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Trail runners')).toBeVisible();
});
