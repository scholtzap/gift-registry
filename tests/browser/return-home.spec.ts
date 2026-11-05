import { expect, test } from '@playwright/test';
import { hashEmail } from '@/server/auth/email-hash';
import { createDb } from '@/server/db/client';
import { hashOtpCode } from '@/server/ledger/otp';

/**
 * Landing → find → verify → both dashboard sections → open → back.
 * No circle is created on this path (docs/plans/owner-circles-return-home.md).
 */
test('returning person reaches every circle and can come back', async ({ page }) => {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const pepper = process.env.PHONE_HASH_PEPPER ?? '';
  const email = `return-${stamp}@example.test`;
  const db = createDb(process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? '');
  const user = await db.prisma.user.create({
    data: { displayName: 'Return Owner', email, emailHash: hashEmail(email, pepper) },
  });
  const hostEmail = `host-${stamp}@example.test`;
  const host = await db.prisma.user.create({
    data: { displayName: 'Other Host', email: hostEmail, emailHash: hashEmail(hostEmail, pepper) },
  });
  const eventDate = new Date('2026-12-05T00:00:00.000Z');
  await db.prisma.circle.create({
    data: {
      name: 'Parents circle', occasion: 'birthday', eventDate, eventDateSetByUserId: user.id,
      ownerUserId: user.id, shareSlug: `ret-a-${stamp}`,
      memberships: { create: [{ userId: user.id, role: 'owner' }] },
    },
  });
  await db.prisma.circle.create({
    data: {
      name: 'Friends circle', occasion: 'birthday', eventDate, eventDateSetByUserId: user.id,
      ownerUserId: user.id, shareSlug: `ret-b-${stamp}`,
      memberships: { create: [{ userId: user.id, role: 'owner' }] },
    },
  });
  await db.prisma.circle.create({
    data: {
      name: 'Niece circle', occasion: 'birthday', eventDate, eventDateSetByUserId: host.id,
      ownerUserId: host.id, shareSlug: `ret-c-${stamp}`,
      memberships: { create: [{ userId: host.id, role: 'owner' }, { userId: user.id, role: 'friend' }] },
    },
  });
  await db.prisma.circle.create({
    data: {
      name: 'Planned picnic', occasion: 'birthday', eventDate,
      ownerUserId: null, proxyCreatedByUserId: user.id, shareSlug: `ret-p-${stamp}`,
    },
  });
  await db.disconnect();

  await page.goto('/');
  await page.getByRole('link', { name: 'My circles' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole('link', { name: 'Open with a code' }).click();
  await expect(page).toHaveURL(/\/app\/find$/);
  await page.getByLabel(/Email or phone number/).fill(email);
  await page.getByRole('button', { name: 'Send my code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();

  const code = await recoverCode(user.id, pepper);
  await page.getByLabel('Code').fill(code);
  await page.getByRole('button', { name: 'Open my circles' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Gifts for you' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gifts for others' })).toBeVisible();
  await expect(page.getByText('Parents circle')).toBeVisible();
  await expect(page.getByText('Friends circle')).toBeVisible();
  await expect(page.getByText('Niece circle')).toBeVisible();
  await expect(page.getByText('Planned picnic')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create my circle' })).toHaveCount(0);

  await page.locator('li').filter({ hasText: 'Parents circle' }).getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/c\/ret-a-/);
  await expect(page.getByText('Your wishes')).toBeVisible();
  // Phone viewport hides the sidebar; chrome "My circles" is the return path.
  await page.getByRole('link', { name: 'My circles' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Gifts for you' })).toBeVisible();

  await page.locator('li').filter({ hasText: 'Planned picnic' }).getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/c\/ret-p-/);
  await expect(page.getByText('The gift list')).toBeVisible();
  await page.getByRole('link', { name: 'Piñata home' }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'My circles' }).first().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Gifts for others' })).toBeVisible();
});

async function recoverCode(userId: string, pepper: string): Promise<string> {
  const db = createDb(process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? '');
  try {
    const rows = await db.prisma.otpCode.findMany({ where: { userId, used: false } });
    const wanted = new Set(rows.map((row) => row.codeHash));
    for (let i = 0; i < 1_000_000; i++) {
      const code = String(i).padStart(6, '0');
      if (wanted.has(hashOtpCode(code, pepper))) return code;
    }
    throw new Error('sign-in code was not stored');
  } finally {
    await db.disconnect();
  }
}
