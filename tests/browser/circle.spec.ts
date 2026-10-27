import { test, expect, type BrowserContext } from '@playwright/test';
import { issueSession, SESSION_COOKIE } from '../../src/server/auth/session';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

let fixture: CircleFixture;
let path: string;

test.beforeAll(async () => {
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

test('landing first click reaches a real invite entry page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Open Piñata', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open your circle', exact: true })).toBeVisible();
});

test('mounted webhook preserves the challenge and refuses forged raw bodies', async ({ request }) => {
  const response = await request.get('/api/wa/webhook?hub.mode=subscribe&hub.verify_token=browser-fixture-verify-token&hub.challenge=000123');
  expect(response.status()).toBe(200);
  expect(await response.text()).toBe('000123');
  expect(response.headers()['cache-control']).toContain('no-store');
  const before = await fixture.db.prisma.ingestEvent.count();
  for (const signature of [undefined, `sha256=${'0'.repeat(64)}`]) {
    const rejected = await request.post('/api/wa/webhook', {
      data: 'not json',
      headers: { 'content-type': 'application/json', ...(signature ? { 'x-hub-signature-256': signature } : {}) },
    });
    expect(rejected.status()).toBe(403);
    expect(rejected.headers()['cache-control']).toContain('no-store');
  }
  expect(await fixture.db.prisma.ingestEvent.count()).toBe(before);
});

test('logged-out gate is generic and private subpaths return no-store 404', async ({ page, request }) => {
  await page.goto(path);
  await expect(page.getByLabel('Your name')).toHaveAttribute('autocomplete', 'name');
  await expect(page.getByLabel('WhatsApp number')).toHaveAttribute('autocomplete', 'tel');
  await expect(page.locator('body')).not.toContainText('Trail runners');
  const response = await request.get(`${path}/draft`);
  expect(response.status()).toBe(404);
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('owner projection stays private across mobile and desktop navigation', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await authenticate(context, 'owner');
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(path);
    await expect(page.getByText('Trail runners', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Coffee grinder');
    await expect(page.locator('body')).not.toContainText('Thabo');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: 'test-results/owner-ledger.png', fullPage: true });
  }
  await page.getByRole('link', { name: 'Trail runners', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your wish' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('manual draft confirmation creates one friend-only item with an unknown price', async ({ page, context }) => {
  await authenticate(context, 'friend');
  await page.goto(`${path}/draft`);
  await page.getByLabel('Title', { exact: false }).fill('Fictional picnic blanket');
  await page.getByLabel('Retailer (optional)').fill('Fictional shop');
  await page.getByLabel('Price in cents').fill('');
  await page.getByRole('button', { name: 'Confirm and add item', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fictional picnic blanket', exact: true })).toBeVisible();
  const rows = await fixture.db.prisma.item.findMany({ where: { circleId: fixture.circleId, title: 'Fictional picnic blanket' } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ addedByUserId: fixture.friendAUserId, visibility: 'friend_only', priceMinor: null });
  await authenticate(context, 'owner');
  await page.goto(path);
  await expect(page.locator('body')).not.toContainText('Fictional picnic blanket');
});

test('native claim release pool contribution and paid recording persist', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await authenticate(context, 'friend');
  await page.goto(`${path}/items/${fixture.itemOwnId}`);
  await page.getByRole('button', { name: 'Claim this gift', exact: true }).click();
  await expect(page.getByText('You claimed this', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Release my claim', exact: true }).click();
  await page.getByLabel('Pool target in cents').fill('10000');
  await page.getByRole('button', { name: 'Start a pool as buyer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You are the buyer', exact: true })).toBeVisible();
  await page.getByLabel('Your contribution in cents').fill('10000');
  await page.getByRole('button', { name: 'Record my contribution', exact: true }).click();
  await page.getByRole('button', { name: 'Mark my contribution as paid', exact: true }).click();
  await expect(page.getByText('Funded', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Funded', { exact: true })).toBeVisible();
  const pool = await fixture.db.prisma.pool.findFirstOrThrow({ where: { itemId: fixture.itemOwnId } });
  expect(pool.status).toBe('funded');
  expect(await fixture.db.prisma.contribution.findUnique({ where: { poolId_userId: { poolId: pool.id, userId: fixture.friendAUserId } } })).toMatchObject({ amountMinor: 10000, status: 'marked_paid' });
  expect(errors).toEqual([]);
});

test('settings native submit updates only the signed actor and reloads', async ({ page, context }) => {
  await authenticate(context, 'friend');
  await page.goto(`${path}/settings`);
  const submitted = page.waitForResponse(response => response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Disable Voice intake', exact: true }).click();
  const response = await submitted;
  const requestHeaders = await response.request().allHeaders();
  expect(requestHeaders.origin).toBe('http://127.0.0.1:3001');
  expect(response.status()).toBe(303);
  await expect(page.getByRole('button', { name: 'Enable Voice intake', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Enable Voice intake', exact: true })).toBeVisible();
  const row = await fixture.db.prisma.entitlement.findUnique({ where: { userId_capability: { userId: fixture.friendAUserId, capability: 'voice_transcribe' } } });
  expect(row?.enabled).toBe(false);
});

test('card preview, anonymous save and literal contributor messages work', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await authenticate(context, 'friend');
  await page.goto(`${path}/items/${fixture.itemGoneId}/card`);
  await page.getByLabel('First name on the card').fill('');
  await page.getByLabel('Your message', { exact: false }).first().fill('  <gift> & joy!  ');
  await page.getByLabel('Show me as Anonymous').check();
  await expect(page.locator('[data-card-name]')).toHaveText('Anonymous');
  await expect(page.locator('[data-card-message]')).toHaveText('<gift> & joy!');
  await page.getByRole('button', { name: 'Save my message', exact: true }).click();
  await expect(page.getByLabel('Show me as Anonymous')).toBeChecked();
  await expect(page.getByLabel('Your message', { exact: false }).first()).toHaveValue('  <gift> & joy!  ');
  await expect(page.getByText('Happy 30th!', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download PNG', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('pinata-card.png');
  expect(errors).toEqual([]);
});

test('anonymous card submission also works without the optional preview script', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await authenticate(context, 'friend');
  const page = await context.newPage();
  await page.goto(`${path}/items/${fixture.itemGoneId}/card`);
  await page.getByLabel('Show me as Anonymous').uncheck();
  await page.getByLabel('First name on the card').fill('Thabo');
  await page.getByLabel('Your message', { exact: false }).first().fill('A sunny afternoon.');
  await page.getByRole('button', { name: 'Save my message', exact: true }).click();
  await page.getByLabel('First name on the card').fill('');
  await page.getByLabel('Show me as Anonymous').check();
  await page.getByRole('button', { name: 'Save my message', exact: true }).click();
  await expect(page.getByLabel('Show me as Anonymous')).toBeChecked();
  await context.close();
});

test('owner and forged friend cookies cannot discover a card', async ({ page, context }) => {
  for (const role of ['owner', 'friend'] as const) {
    await authenticate(context, role, fixture.ownerUserId);
    const response = await page.goto(`${path}/items/${fixture.itemGoneId}/card`);
    expect(response?.status()).toBe(404);
    expect(response?.headers()['cache-control']).toContain('no-store');
    await expect(page.locator('body')).not.toContainText('Happy 30th!');
    await expect(page.locator('meta[property^="og:"]')).toHaveCount(0);
  }
});

test('a friend sets the party date with no JavaScript and the owner loses it', async ({ browser }) => {
  // The whole countdown feature has to survive the WhatsApp in-app browser, where the page has no
  // script: the write is a native form post and the redirect is a 303.
  const context = await browser.newContext({ javaScriptEnabled: false });
  await authenticate(context, 'friend');
  const page = await context.newPage();

  await page.goto(path);
  await expect(page.getByText('Sat 5 Dec', { exact: true })).toBeVisible();
  await expect(page.getByText('Birthday: 3 Apr', { exact: true })).toBeVisible();

  await page.getByLabel('When is the party?').fill('2026-12-19');
  const submitted = page.waitForResponse((r) => r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save the date', exact: true }).click();
  expect((await submitted).status()).toBe(303);
  await expect(page.getByText('Sat 19 Dec', { exact: true })).toBeVisible();
  await expect(page.getByText(/days to go|Tomorrow|Today|The day has passed/)).toBeVisible();

  await authenticate(context, 'owner');
  await page.goto(path);
  await expect(page.locator('body')).not.toContainText('2026-12-19');
  await expect(page.locator('body')).not.toContainText('Sat 19 Dec');
  // Silence, not an error: the owner still sees the birthday, and can still write the date.
  await expect(page.getByText('Birthday: 3 Apr', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('set by');
  await expect(page.locator('body')).not.toContainText('who set');

  await page.getByLabel('When is the party?').fill('2026-12-05');
  await page.getByRole('button', { name: 'Save the date', exact: true }).click();
  await expect(page.getByText('Sat 5 Dec', { exact: true })).toBeVisible();
  const circle = await fixture.db.prisma.circle.findUniqueOrThrow({ where: { id: fixture.circleId } });
  expect(circle.eventDateSetByUserId).toBe(fixture.ownerUserId);
  await context.close();
});
