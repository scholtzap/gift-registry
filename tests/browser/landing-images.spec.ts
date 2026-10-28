import { test, expect } from '@playwright/test';

/** CR-UX-03 guard: every <img> on the landing must actually load (naturalWidth > 0). */
test('every landing image resolves', async ({ page }) => {
  await page.goto('/');
  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => !(img.complete && img.naturalWidth > 0))
      .map((img) => img.getAttribute('src') ?? '(no src)'),
  );
  expect(broken).toEqual([]);
  await expect(page.getByText(/tests\/browser|screenshots\.spec/)).toHaveCount(0);
});

test('lookup renders inside the app shell (CR-UX-02)', async ({ page }) => {
  await page.goto('/lookup');
  await expect(page.locator('link[href$="/pinata.css"]')).toHaveCount(1);
  await expect(page.getByText('You are starting a circle for someone else.')).toBeVisible();
});
