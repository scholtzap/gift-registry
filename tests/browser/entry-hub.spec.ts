import { test, expect } from '@playwright/test';

const suffix = String(Math.floor(10000 + Math.random() * 90000));
const num = (n: number) => `+999${suffix}${String(n).padStart(4, '0')}`;

/** CR-UX-01: landing -> hub -> create -> owner ledger with share link; no primary button reloads its own page. */
test('landing to hub to created owner ledger with share link', async ({ page }) => {
  await page.goto('/');
  const landingUrl = page.url();
  await page.getByRole('link', { name: 'Start your circle' }).first().click();
  await expect(page).not.toHaveURL(landingUrl);
  await expect(page.getByRole('heading', { name: 'Create my circle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open my circles' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start a circle for someone' })).toBeVisible();

  await page.getByLabel(/Your name/).fill('Browser Owner');
  await page.getByLabel('Occasion').fill('birthday');
  await page.getByLabel(/Party date/).fill('2026-12-05');
  await page.getByLabel('Your email').fill(`browser-${suffix}@example.test`);
  await page.getByLabel(/WhatsApp number/).fill(num(91));
  await page.getByLabel(/First wish/).fill('Browser first wish');
  await page.getByRole('button', { name: 'Create my circle' }).click();

  await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{16,}$/);
  await expect(page.getByText('Browser first wish')).toBeVisible();
  await expect(page.getByText('Your wishes')).toBeVisible();
  const slug = new URL(page.url()).pathname.split('/c/')[1];
  await expect(page.getByRole('link', { name: 'Open your circle link' })).toHaveAttribute('href', `/c/${slug}`);
});

test('hub My circles opens find, not a paste link', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByLabel(/Circle link or code/)).toHaveCount(0);
  await page.getByRole('link', { name: 'My circles' }).click();
  await expect(page).toHaveURL(/\/app\/find$/);
  await expect(page.getByRole('heading', { name: 'Open my circles' })).toBeVisible();
  await page.getByLabel(/Email or phone number/).fill('owner@example.test');
  await page.getByRole('button', { name: 'Send my code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/code is on its way/);
});
