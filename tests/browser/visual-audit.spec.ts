import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { issueSession, SESSION_COOKIE } from '../../src/server/auth/session';
import { seedCircle, type CircleFixture } from '../leak/fixtures';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = 'test-results/audit';
const WIDTHS = [360, 768, 1440];
let fixture: CircleFixture;
let path: string;

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
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

async function authenticate(context: BrowserContext, role: 'owner' | 'friend', userId?: string) {
  await context.addCookies([{
    name: SESSION_COOKIE,
    value: issueSession({ role, userId: userId ?? (role === 'owner' ? fixture.ownerUserId : fixture.friendAUserId), circleId: fixture.circleId }),
    url: 'http://127.0.0.1:3001', httpOnly: true, sameSite: 'Lax',
  }]);
}

// Walks rendered text and reports every foreground/background pair below AA, with its selector path.
async function contrastSweep(page: Page) {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];
    // `rgb()` carries no alpha channel, so a missing fourth component means fully opaque (255),
    // not 1 — defaulting it to 1 made every pair read as white-on-white and hid the whole sweep.
    const parse = (value: string): Rgba => {
      const parts = value.match(/[\d.]+/g)?.slice(0, 4).map(Number) ?? [];
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts.length > 3 ? parts[3]! : 255];
    };
    const alpha = (a: number) => (Number.isNaN(a) ? 1 : a / 255);
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (c: Rgba) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
    const blend = (fg: Rgba, bg: Rgba): Rgba => {
      const a = alpha(fg[3]);
      return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
    };
    const backdrop = (el: Element): Rgba => {
      let node: Element | null = el;
      while (node) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (alpha(color[3]) > 0) return color;
        node = node.parentElement;
      }
      return [255, 255, 255, 255];
    };
    const ratio = (fg: Rgba, bg: Rgba) => {
      const lights = [luminance(blend(fg, bg)), luminance(bg)].sort((a, b) => b - a);
      return (lights[0]! + 0.05) / (lights[1]! + 0.05);
    };
    const path = (el: Element) => {
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== document.body && parts.length < 3) {
        parts.unshift(node.tagName.toLowerCase() + (node.className ? `.${String(node.className).trim().split(/\s+/).join('.')}` : ''));
        node = node.parentElement;
      }
      return parts.join(' > ');
    };
    const findings: { text: string; ratio: number; path: string; size: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const text = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent?.trim()).filter(Boolean).join(' ');
      if (!text) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || el.getClientRects().length === 0) continue;
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      const fg = parse(style.color);
      const actual = ratio(fg, backdrop(el));
      if (actual < need) findings.push({ text: text.slice(0, 40), ratio: Number(actual.toFixed(2)), path: path(el), size });
    }
    return findings;
  });
}

async function touchSweep(page: Page) {
  return page.evaluate(() => {
    const small: { label: string; w: number; h: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('a,button,input,select,textarea,summary'))) {
      // A checkbox's tap target is its wrapping label, not the 22px box (WCAG 2.5.5).
      const box = (el instanceof HTMLInputElement && /^(checkbox|radio)$/.test(el.type) ? el.closest('label') : el)?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) continue;
      if (box.height < 44 || box.width < 24) {
        small.push({ label: ((el as HTMLElement).innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30), h: Math.round(box.height), w: Math.round(box.width) });
      }
    }
    return small;
  });
}

const targets = [
  { name: '01-landing', url: '/', role: 'none' as const },
  { name: '02-app-entry', url: '/app', role: 'none' as const },
  { name: '03-gate', url: 'GATE', role: 'none' as const },
  { name: '04-404', url: 'NOTFOUND', role: 'none' as const },
  { name: '05-owner-ledger', url: 'GATE', role: 'owner' as const },
  { name: '06-friend-ledger', url: 'GATE', role: 'friend' as const },
  { name: '07-item-detail', url: 'ITEM', role: 'friend' as const },
  { name: '08-draft-confirm', url: 'DRAFT', role: 'friend' as const },
  { name: '09-card-composer', url: 'CARD', role: 'friend' as const },
  { name: '10-settings', url: 'SETTINGS', role: 'friend' as const },
  { name: '11-owner-settings', url: 'SETTINGS', role: 'owner' as const },
  { name: '12-owner-item', url: 'ITEM', role: 'owner' as const },
  { name: '13-offline', url: '/offline', role: 'none' as const },
];

test('capture every screen at three widths and fail on overflow, contrast or console errors', async ({ browser }) => {
  const report: Record<string, unknown> = {};
  const violations: string[] = [];

  for (const target of targets) {
    const shots: { width: number; file: string }[] = [];
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      if (target.role !== 'none') await authenticate(context, target.role);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

      const url = target.url === 'GATE' ? path
        : target.url === 'NOTFOUND' ? `${path}/no-such-path`
        : target.url === 'ITEM' ? `${path}/items/${fixture.itemOwnId}`
        : target.url === 'CARD' ? `${path}/items/${fixture.itemGoneId}/card`
        : target.url === 'DRAFT' ? `${path}/draft`
        : target.url === 'SETTINGS' ? `${path}/settings`
        : target.url;
      const response = await page.goto(url, { waitUntil: 'networkidle' });
      const file = `${target.name}-${width}.png`;
      await page.screenshot({ path: join(OUT, file), fullPage: true });
      const metrics = await page.evaluate(() => ({
        status: 0,
        scrollOverflow: document.documentElement.scrollWidth - window.innerWidth,
        sections: document.querySelectorAll('main > *').length,
        columns: Array.from(document.querySelectorAll('main > *')).map(el => Math.round(el.getBoundingClientRect().height)),
      }));
      const contrast = target.url === 'NOTFOUND' ? [] : await contrastSweep(page);
      const touches = await touchSweep(page);
      const key = `${target.name}@${width}`;
      if (metrics.scrollOverflow > 0) violations.push(`${key}: horizontal overflow ${metrics.scrollOverflow}px`);
      for (const finding of contrast) violations.push(`${key}: contrast ${finding.ratio} on "${finding.text}" (${finding.path})`);
      for (const target of touches) violations.push(`${key}: ${target.w}x${target.h} target "${target.label}"`);
      // The 404 target logs its own expected 404 in the console.
      if (target.url !== 'NOTFOUND' && errors.length > 0) violations.push(`${key}: ${errors.join(' | ')}`);
      report[key] = {
        status: response?.status() ?? 0,
        scrollOverflow: metrics.scrollOverflow,
        sections: metrics.sections,
        heightRatios: metrics.columns,
        contrast: contrast.slice(0, 12),
        smallTargets: touches.slice(0, 12),
        errors,
      };
      shots.push({ width, file });
      await context.close();
    }

    // One contact sheet per screen: widths side by side, heights normalised.
    const images = [];
    for (const shot of shots) {
      const info = await sharp(join(OUT, shot.file)).ensureAlpha().toBuffer({ resolveWithObject: true });
      const height = Math.min(info.info.height, 2600);
      images.push({
        input: await sharp(info.data).resize({ width: 600, height, fit: 'inside', background: '#ffffff' }).png().toBuffer(),
        info: { width: Math.min(info.info.width, 600), height },
      });
    }
    const totalWidth = images.reduce((sum, image) => sum + image.info.width + 24, 24);
    const maxHeight = Math.max(...images.map(image => image.info.height));
    let offset = 24;
    const composite = [];
    for (const image of images) {
      composite.push({ input: image.input, left: offset, top: 24 });
      offset += image.info.width + 24;
    }
    await sharp({ create: { width: totalWidth, height: maxHeight + 48, channels: 4, background: '#ffffff' } })
      .composite(composite).png().toFile(join(OUT, `${target.name}-sheet.png`));
  }

  await mkdir(OUT, { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(OUT, 'audit.json'), JSON.stringify(report, null, 2), 'utf8');
  expect(Object.keys(report)).toHaveLength(WIDTHS.length * targets.length);
  expect(violations).toEqual([]);
});
