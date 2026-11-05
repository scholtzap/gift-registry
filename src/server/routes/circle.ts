import { createElement, type ReactNode } from "react";
import { CONTENT_SECURITY_POLICY, page } from "@/server/routes/shell";
import { createRequire } from 'node:module';
import { z } from 'zod';
import type { Actor, Db } from "@/server/db/client";
import { FriendLedgerScreen } from "@/components/screens/friend-ledger";
import { OwnerLedgerScreen, OwnerItemScreen } from "@/components/screens/owner-ledger";
import { CircleMenu } from "@/components/screens/circle-menu";
import { loadAccessibleCircles } from "@/server/views/dashboard";
import { JoinScreen } from "@/components/screens/join";
import { SettingsScreen } from "@/components/screens/settings";
import { DraftConfirmScreen } from '@/components/screens/draft-confirm';
import { RegistryPickerScreen, RegistryPreviewScreen } from '@/components/screens/registry-picker';
import { ItemDetailScreen } from '@/components/screens/item-detail';
import { PayoutShareScreen } from '@/components/screens/payout-share';
import { CardComposerScreen } from '@/components/screens/card-composer';
import { CardEntryValidationError, CardNotFoundError, generateCardPun, getCard, renderCardVariant, saveCardEntry } from '@/server/cards';
import { modelsForActor } from '@/server/models/client';
import { Screen } from '@/components/ui';
import { friendCircleView, ownerCircleView, payoutShareText } from "@/server/views";
import { hashPhone, normalizeE164 } from "@/server/auth/phone-hash";
import { trustedClientAddress } from "@/server/auth/client-address";
import { isSameOrigin } from "@/server/auth/same-origin";
import { gateThrottle } from "@/server/auth/throttle-store";
import { claimIdempotencyKey, parseIdempotencyKey } from "@/server/auth/idempotency";
import { checkTurnstile, turnstileField } from "@/server/auth/turnstile";
import { issueSession, sessionCookie, sessionFromRequest, SESSION_COOKIE } from "@/server/auth/session";
import { AI_CAPABILITIES, assertCan, CAPABILITY_COPY, CapabilityOffError, setCapability } from "@/server/entitlements";
import { addItem, claimItem, contribute, createPool, markPaid, markPaidFor, purchasePool, releaseClaim, revealItem, savePayout, setEventDate, setItemPhoto } from '@/server/ledger';
import {
  linkRegistryItem, previewCircleLinks, setLinkVisibility, unlinkRegistryItem,
} from '@/server/ledger/registry';
import { formatMinor } from '@/lib/money';
import { isCalendarDate } from '@/lib/dates';
import { readStoredMedia } from '@/server/wa/store';
import { guardNoPersonPixels, type VisionServices } from '@/server/vision';

export interface CircleRouteDeps { visionServices?: VisionServices }
import { env } from "@/lib/env";
import { CURRENCIES, parseAmountToMinor } from "@/lib/money";
import { PHOTO_MAX_BYTES, PhotoRejectedError, deletePhoto, readPhoto, storePhoto } from "@/server/photos";
import { isArchived } from "@/server/lifecycle";

// Native-form HTML uses Node SSR, not the App Route's react-server export condition.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as typeof import('react-dom/server');

/**
 * `/c/<slug>` — the one URL that gets pasted into a WhatsApp group, and the reason the app has
 * two projections instead of one. This module is deliberately framework-free and takes its `Db`
 * as an argument: `src/app/c/[slug]/route.ts` is a six-line adapter over it, so the role split
 * is testable against the test database without booting Next, and swapping the adapter for a
 * styled `page.tsx` later changes nothing here.
 *
 * Three rules this file exists to not break:
 *
 * 1. **404, never 403.** "Not yours" and "does not exist" produce the identical response. A 403
 *    tells a curious caller that something is in there, which is the first half of a leak.
 * 2. **Never cacheable.** One URL, two projections. A shared or proxy cache that stored the
 *    owner's response would serve it to a friend and vice versa, so every response here is
 *    `private, no-store` — including the gate and the 404.
 * 3. **The gate writes only after it has authorised.** The allowlist hash match happens before
 *    any row is created, and the write path runs as the login role because a person who is not
 *    a member yet has no RLS rights to exercise.
 */

const NO_STORE = "private, no-store, max-age=0, must-revalidate";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  // no-referrer makes Chromium's native form Origin opaque; same-origin still hides URLs from external sites.
  return { 'Cache-Control': NO_STORE, 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': CONTENT_SECURITY_POLICY, ...extra };
}

function notFound(): Response {
  // Same body, same status, same headers for every kind of no.
  return new Response(page("Not found", "<p>That circle link is not valid.</p>"), {
    status: 404,
    headers: headers({ "Content-Type": "text/html; charset=utf-8" }),
  });
}

/**
 * The HTML shell for every `/c/<slug>` response. The role split underneath it is what the tests
 * pin, not the elements.
 *
 * Everything in this head is static brand metadata, byte-identical for owner and friend, which
 * is the only reason it is allowed here at all: this document is `private, no-store` because one
 * URL renders two projections, so anything per-role belongs in `body`, never in the shell.
 *
 * The PWA tags are hand-written because a raw `Response` cannot use Next's metadata API:
 * `src/app/manifest.ts` generates `/manifest.webmanifest` and Next links it on its own side, so
 * both shells point at the one manifest file, and `public/sw.js` precaches it. `viewport-fit`
 * matches the Next `viewport` export so the safe-area padding in `/pinata.css` behaves the same
 * in the circle as it does on the landing page.
 */
function gateForm(notice?: string, retry?: { initialName?: string; initialPhone?: string; rejected?: boolean }): Response {
  return new Response(page('Join this circle', renderToStaticMarkup(createElement(JoinScreen, { basePath: process.env.PINATA_BASE_PATH ?? '', notice, ...retry }))), {
    status: 200, headers: headers({ 'Content-Type': 'text/html; charset=utf-8' }),
  });
}

const REJECTED_NOTICE = "We could not let you in with that number.";
function rejectedForm(name: string, phone: string): Response {
  return gateForm(REJECTED_NOTICE, { initialName: name, initialPhone: phone, rejected: true });
}

function renderOwner(view: NonNullable<Awaited<ReturnType<typeof ownerCircleView>>>, basePath: string, date?: { notice?: string; eventDateDraft?: string | null }, menu?: ReactNode): Response {
  return new Response(page(view.name, renderToStaticMarkup(createElement(OwnerLedgerScreen, { view, basePath, menu, ...date }))), {
    status: date?.notice ? 422 : 200,
    headers: headers({ 'Content-Type': 'text/html; charset=utf-8' }),
  });
}

function renderFriend(view: NonNullable<Awaited<ReturnType<typeof friendCircleView>>>, basePath: string, date?: { notice?: string; eventDateDraft?: string | null }, menu?: ReactNode): Response {
  return new Response(
    page(view.name, renderToStaticMarkup(createElement(FriendLedgerScreen, { view, basePath, menu, ...date }))),
    { status: date?.notice ? 422 : 200, headers: headers({ "Content-Type": "text/html; charset=utf-8" }) },
  );
}

/**
 * The ledger for the caller's own role, with a rejected date put back in the field. Both
 * projections re-render through here so neither can accidentally render the *other*: the secrecy
 * rule lives in the builders, and a route that picked the wrong builder would spoil a surprise
 * on its own.
 */
async function renderLedger(db: Db, actor: Actor, circleId: string, basePath: string, date?: { notice?: string; eventDateDraft?: string | null }): Promise<Response> {
  const circles = actor.userId ? await loadAccessibleCircles(db, actor.userId) : [];
  const currentSlug = decodeURIComponent(basePath.slice('/c/'.length));
  const menu = createElement(CircleMenu, {
    circles: circles.map((circle) => ({ name: circle.name, shareSlug: circle.shareSlug, role: circle.role })),
    currentSlug,
    appHref: `${process.env.PINATA_BASE_PATH ?? ''}/app`,
  });
  if (actor.role === 'owner') {
    const view = await db.withActor(actor, tx => ownerCircleView(tx, circleId));
    return view === null ? notFound() : renderOwner(view, basePath, date, menu);
  }
  const view = await db.withActor(actor, tx => friendCircleView(tx, circleId, actor.userId));
  return view === null ? notFound() : renderFriend(view, basePath, date, menu);
}

function screenResponse(title: string, content: ReactNode, status = 200): Response {
  return new Response(page(title, renderToStaticMarkup(content)), {
    status, headers: headers({ 'Content-Type': 'text/html; charset=utf-8' }),
  });
}

function validUuid(id: string): boolean {
  return z.uuid().safeParse(id).success;
}

/** Match `/items/<uuid>` with an optional suffix; null when the shape or uuid is wrong. */
function matchItemId(pathSuffix: string, pattern: RegExp): string | null {
  const match = pathSuffix.match(pattern);
  if (!match) return null;
  const itemId = match[1]!;
  if (!validUuid(itemId)) return null;
  return itemId;
}

function itemError(item: { title: string } & Parameters<typeof ItemDetailScreen>[0]['item'], basePath: string, notice: string, status: number): Response {
  return screenResponse(item.title, createElement(ItemDetailScreen, { item, basePath, notice }), status);
}

async function cardPng(db: Db, actor: Actor, itemId: string, variant: string | null = null): Promise<Response> {
  if (variant !== null && variant !== 'screen' && variant !== 'print') return notFound();
  try {
    const png = await renderCardVariant(db, actor, itemId, variant === 'print' ? 'print' : 'screen');
    return new Response(new Uint8Array(png), { headers: headers({
      'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="pinata-card.png"',
    }) });
  } catch (error) {
    if (error instanceof CardNotFoundError) return notFound();
    throw error;
  }
}

const refreshCookie = new WeakMap<Request, string>();

/**
 * Owner, active friend, or share-link auto-join. A signed-in person who opens
 * `/c/<slug>` gets a friend membership (login-role upsert). Anonymous visitors
 * still hit the phone allowlist gate. The owner never gets a friend row.
 */
async function resolveCircleAccess(db: Db, userId: string, circleId: string): Promise<{ role: 'owner' | 'friend' } | null> {
  const circle = await db.prisma.circle.findUnique({
    where: { id: circleId },
    select: {
      status: true,
      ownerUserId: true,
      memberships: { where: { userId, status: 'active' }, select: { role: true } },
    },
  });
  if (!circle || circle.status !== 'active') return null;
  if (circle.ownerUserId === userId) return { role: 'owner' };
  if (circle.memberships.some((row) => row.role === 'friend')) return { role: 'friend' };
  await db.prisma.membership.upsert({
    where: { circleId_userId: { circleId, userId } },
    create: { circleId, userId, role: 'friend', status: 'active' },
    update: { role: 'friend', status: 'active', dashboardHidden: false },
  });
  return { role: 'friend' };
}

/** Point the signed cookie at the circle being opened, without trusting the cookie's old circle id. */
async function bindCircleSession(db: Db, request: Request, circleId: string): Promise<Request> {
  const session = sessionFromRequest(request);
  if (!session) return request;
  const access = await resolveCircleAccess(db, session.userId, circleId);
  if (!access) return request;
  if (session.circleId === circleId && session.role === access.role) return request;
  const token = issueSession({ userId: session.userId, circleId, role: access.role });
  const headers = new Headers(request.headers);
  headers.set('cookie', `${SESSION_COOKIE}=${token}`);
  refreshCookie.set(request, sessionCookie(token, new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)));
  return new Request(request, { headers });
}

function applyRefresh(request: Request, response: Response): Response {
  const cookie = refreshCookie.get(request);
  if (!cookie) return response;
  const next = new Headers(response.headers);
  next.append('Set-Cookie', cookie);
  return new Response(response.body, { status: response.status, headers: next });
}

async function privateActor(db: Db, request: Request, circleId: string): Promise<Actor | null> {
  const session = sessionFromRequest(request);
  if (!session || session.circleId !== circleId) return null;
  const actor: Actor = { role: session.role, userId: session.userId, circleId };
  return db.withActor(actor, async tx => {
    const circle = await tx.circle.findUnique({ where: { id: circleId }, select: { ownerUserId: true, status: true } });
    const member = await tx.membership.findUnique({
      where: { circleId_userId: { circleId, userId: actor.userId } }, select: { role: true, status: true },
    });
    if (!circle || circle.status !== 'active' || !member || member.status !== 'active' || member.role !== actor.role ||
        (actor.role === 'owner') !== (circle.ownerUserId === actor.userId)) return null;
    return actor;
  });
}

const draftSchema = z.object({
  version: z.literal(1),
  candidates: z.tuple([z.object({
    index: z.literal(0), state: z.literal('pending'), title: z.string().min(1).max(200),
    brand: z.string().max(100).nullable(), priceMinor: z.number().int().min(0).max(2147483647).nullable(),
    currency: z.enum(CURRENCIES), imagePath: z.string().nullable().optional(),
  })]),
});
const centsSchema = z.string().regex(/^(0|[1-9]\d*)$/).transform(Number).pipe(z.number().int().min(0).max(2147483647));
const positiveCentsSchema = centsSchema.pipe(z.number().positive());

// Forms post amounts as people type them in the item's currency ("$400", "R 99,50"); the
// integer-cents field stays accepted for callers that already send it. The result is a cents
// string for `centsSchema`, '' for blank, or a value that fails it.
function minorField(fields: FormData, amountName: string, minorName: string, currency: string): FormDataEntryValue | null {
  const typed = fields.get(amountName);
  if (typed === null) return fields.get(minorName);
  if (String(typed).trim() === '') return '';
  const minor = parseAmountToMinor(typed, currency);
  return minor === null ? 'invalid' : String(minor);
}

async function loadRegistryPicker(db: Db, actor: Actor, circleId: string) {
  return db.withActor(actor, async (tx) => {
    const [availableRows, linkedRows, visibleRows] = await Promise.all([
      tx.registryItem.findMany({
        where: { ownerUserId: actor.userId, private: false, links: { none: { circleId } } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, priceMinor: true, currency: true },
      }),
      tx.circleItemLink.findMany({
        where: { circleId, registryItem: { ownerUserId: actor.userId, private: false } },
        orderBy: { createdAt: 'asc' },
        include: { registryItem: { select: { id: true, title: true, priceMinor: true, currency: true } } },
      }),
      tx.circleItemLink.findMany({
        where: { circleId, visible: true, registryItem: { ownerUserId: actor.userId, private: false } },
        orderBy: { createdAt: 'asc' },
        include: { registryItem: { select: { title: true } } },
      }),
    ]);
    return {
      available: availableRows.map((item) => ({
        id: item.id,
        title: item.title,
        price: item.priceMinor === null ? null : formatMinor(item.priceMinor, item.currency),
      })),
      linked: linkedRows.map((link) => ({
        id: link.registryItem.id,
        title: link.registryItem.title,
        price: link.registryItem.priceMinor === null
          ? null
          : formatMinor(link.registryItem.priceMinor, link.registryItem.currency),
        visible: link.visible,
        previewed: link.previewedAt !== null,
      })),
      visibleTitles: visibleRows.map((link) => link.registryItem.title),
    };
  });
}

async function circleGet(db: Db, request: Request, slug: string): Promise<Response> {
  const basePath = `/c/${encodeURIComponent(slug)}`;
  const pathname = new URL(request.url).pathname;
  const circle = await db.prisma.circle.findUnique({ where: { shareSlug: slug }, select: { id: true, name: true, defaultCurrency: true } });
  if (!circle) return notFound();
  request = await bindCircleSession(db, request, circle.id);
  const session = sessionFromRequest(request);
  if (!session || session.circleId !== circle.id) return pathname === basePath ? gateForm() : notFound();
  const actor = await privateActor(db, request, circle.id);
  if (!actor) return notFound();
  // The shell header needs to say which circle you are in and whose side of it you are on.
  const circleContext = { name: circle.name, role: actor.role };

  if (pathname === `${basePath}/settings`) {
    const settings = await db.withActor(actor, async tx => {
      const rows = [];
      for (const capability of AI_CAPABILITIES) {
        let enabled = true;
        try { await assertCan(tx, actor, capability); }
        catch (error) { if (error instanceof CapabilityOffError) enabled = false; else throw error; }
        rows.push({ capability, ...CAPABILITY_COPY[capability], enabled });
      }
      return rows;
    });
    return screenResponse('Settings', createElement(SettingsScreen, { settings, basePath, circle: circleContext }));
  }
  if (pathname === `${basePath}/draft`) {
    const requestedId = new URL(request.url).searchParams.get('id');
    if (requestedId && !z.uuid().safeParse(requestedId).success) return notFound();
    const ingest = await db.withActor(actor, tx => tx.ingestEvent.findFirst({
      where: { circleId: circle.id, userId: actor.userId, status: 'parsed', ...(requestedId ? { id: requestedId } : {}) },
      select: { id: true, draft: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    if (requestedId && !ingest) return notFound();
    const parsed = ingest ? draftSchema.safeParse(ingest.draft) : null;
    if (parsed && !parsed.success) return screenResponse('Draft unavailable', createElement(Screen, { title: 'Draft unavailable', backHref: basePath, circle: circleContext, children: 'This draft could not be read. Return to the circle and add the item manually.' }), 503);
    const candidate = parsed?.success ? parsed.data.candidates[0] : null;
    const draft = candidate ? { id: ingest!.id, title: candidate.title, retailer: candidate.brand, priceMinor: candidate.priceMinor, currency: candidate.currency } : null;
    const suggestions = actor.role !== 'owner' ? [] : (
      await db.withActor(actor, tx => tx.registryItem.findMany({
        where: {
          ownerUserId: actor.userId,
          private: false,
          links: { none: { circleId: circle.id } },
        },
        orderBy: { createdAt: 'asc' },
        take: 12,
        select: { id: true, title: true, priceMinor: true, currency: true },
      }))
    ).map((item) => ({
      id: item.id,
      title: item.title,
      price: item.priceMinor === null ? null : formatMinor(item.priceMinor, item.currency),
    }));
    return screenResponse('Review your draft', createElement(DraftConfirmScreen, {
      draft, basePath, role: actor.role, circle: circleContext, defaultCurrency: circle.defaultCurrency, suggestions,
    }));
  }
  if (pathname === `${basePath}/registry` || pathname === `${basePath}/registry/preview`) {
    if (actor.role !== 'owner') return notFound();
    const picker = await loadRegistryPicker(db, actor, circle.id);
    if (pathname === `${basePath}/registry/preview`) {
      return screenResponse(`Previewing ${circle.name}`, createElement(RegistryPreviewScreen, {
        circleName: circle.name,
        basePath,
        circle: circleContext,
        titles: picker.visibleTitles,
        showable: picker.linked.filter((item) => !item.visible && item.previewed).map(({ id, title, price }) => ({ id, title, price })),
      }));
    }
    const linkedNotice = new URL(request.url).searchParams.get('linked') === '1'
      ? 'Added from your registry — still hidden until you preview and show it.'
      : undefined;
    return screenResponse(`Sharing in ${circle.name}`, createElement(RegistryPickerScreen, {
      circleName: circle.name,
      basePath,
      circle: circleContext,
      available: picker.available,
      linked: picker.linked,
      notice: linkedNotice,
      noticeKind: linkedNotice ? 'success' : 'error',
    }));
  }
  const cardSuffix = pathname.slice(basePath.length);
  const cardPngSuffix = cardSuffix.match(/^\/items\/([^/]+)\/card(\/png)?$/);
  if (cardPngSuffix) {
    const itemId = matchItemId(cardSuffix, /^\/items\/([^/]+)\/card(\/png)?$/);
    if (actor.role !== 'friend' || itemId === null) return notFound();
    const card = await db.withActor(actor, tx => getCard(tx, actor, itemId));
    if (!card) return notFound();
    if (cardPngSuffix[2]) return cardPng(db, actor, itemId, new URL(request.url).searchParams.get('variant'));
    return screenResponse('Gift card', createElement(CardComposerScreen, { card, basePath, circle: circleContext }));
  }
  const photoSuffix = pathname.slice(basePath.length);
  const photoMatch = photoSuffix.match(/^\/items\/([^/]+)\/photo$/);
  if (photoMatch) {
    const itemId = matchItemId(photoSuffix, /^\/items\/([^/]+)\/photo$/);
    if (itemId === null) return notFound();
    // The viewer's own projection decides, so an owner never gets a friend-only item's photo,
    // and a miss looks the same as an item that does not exist.
    const visible = actor.role === 'owner'
      ? (await db.withActor(actor, tx => ownerCircleView(tx, circle.id)))?.items.find(row => row.id === itemId)
      : (await db.withActor(actor, tx => friendCircleView(tx, circle.id, actor.userId)))?.items.find(row => row.id === itemId);
    if (!visible?.hasPhoto) return notFound();
    const row = await db.withActor(actor, tx => tx.item.findFirst({ where: { id: itemId, circleId: circle.id }, select: { imagePath: true } }));
    const bytes = await readPhoto(env.MEDIA_DIR, row?.imagePath ?? null);
    if (!bytes) return notFound();
    return new Response(new Uint8Array(bytes), { headers: headers({ 'Content-Type': 'image/webp', 'Content-Disposition': 'inline' }) });
  }
  const paySuffix = pathname.slice(basePath.length);
  const payMatch = paySuffix.match(/^\/items\/([^/]+)\/pay$/);
  if (payMatch) {
    const itemId = matchItemId(paySuffix, /^\/items\/([^/]+)\/pay$/);
    if (actor.role !== 'friend' || itemId === null) return notFound();
    const view = await db.withActor(actor, tx => friendCircleView(tx, circle.id, actor.userId));
    const item = view?.items.find(row => row.id === itemId);
    const pool = item?.pool ?? null;
    // Same gate as the details themselves: the buyer, or a pledger once the
    // buyer switched sharing on. Anything else reads exactly like nothing.
    if (!item || !pool || pool.payout === null) return notFound();
    const shareText = payoutShareText(item.title, pool);
    return screenResponse(`Pay for ${item.title}`, createElement(PayoutShareScreen, {
      itemTitle: item.title,
      pool,
      backHref: `${basePath}/items/${itemId}`,
      circle: circleContext,
      shareText,
      shareHref: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
    }));
  }
  const itemSuffix = pathname.slice(basePath.length);
  const itemMatch = itemSuffix.match(/^\/items\/([^/]+)$/);
  if (itemMatch) {
    const itemId = matchItemId(itemSuffix, /^\/items\/([^/]+)$/);
    if (itemId === null) return notFound();
    if (actor.role === 'owner') {
      const view = await db.withActor(actor, tx => ownerCircleView(tx, circle.id));
      const item = view?.items.find(row => row.id === itemId);
      if (!item) return notFound();
      return screenResponse(item.title, createElement(OwnerItemScreen, { item, basePath, circle: circleContext }));
    }
    const view = await db.withActor(actor, tx => friendCircleView(tx, circle.id, actor.userId));
    const item = view?.items.find(row => row.id === itemId);
    return item ? screenResponse(item.title, createElement(ItemDetailScreen, { item, basePath, circle: circleContext })) : notFound();
  }
  if (pathname !== basePath) return notFound();
  return renderLedger(db, actor, circle.id, basePath);
}

async function readForm(request: Request, limit = 16_384): Promise<FormData> {
  if (!request.body) throw new Error('missing_form');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error('form_too_large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}

function intakeMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Carry a WhatsApp intake photo onto the item being confirmed. Fail closed: capability off,
 * no person detector, a person in frame, or unreadable media all drop the photo and the item
 * still confirms (the person can add a photo manually afterwards).
 */
async function carryIntakePhoto(db: Db, actor: Actor, ingestId: string, deps: CircleRouteDeps): Promise<string | undefined> {
  try {
    const ingest = await db.withActor(actor, tx => tx.ingestEvent.findFirst({
      where: { id: ingestId, circleId: actor.circleId!, userId: actor.userId, status: 'parsed' },
      select: { kind: true, draft: true },
    }));
    if (!ingest || ingest.kind !== 'image') return undefined;
    const parsed = draftSchema.safeParse(ingest.draft);
    if (!parsed.success || !parsed.data.candidates[0].imagePath) return undefined;
    await db.withActor(actor, tx => assertCan(tx, actor, 'photo_extract'));
    const bytes = await readStoredMedia(env.MEDIA_DIR, ingestId, PHOTO_MAX_BYTES);
    if (!bytes) return undefined;
    await guardNoPersonPixels(bytes, deps.visionServices);
    const mime = intakeMime(bytes);
    if (!mime) return undefined;
    return await storePhoto(env.MEDIA_DIR, new File([new Uint8Array(bytes)], 'intake-photo', { type: mime }));
  } catch { return undefined; }
}

async function circlePost(db: Db, request: Request, slug: string, deps: CircleRouteDeps = {}): Promise<Response> {
  const basePath = `/c/${encodeURIComponent(slug)}`;
  const pathname = new URL(request.url).pathname;
  if (!isSameOrigin(request)) {
    return pathname === basePath ? gateForm('That submission could not be verified as coming from this page. Open the link again and try.') : notFound();
  }

  const circle = await db.prisma.circle.findUnique({
    where: { shareSlug: slug },
    select: { id: true, status: true, createdAt: true, eventDate: true, ownerUserId: true, name: true },
  });
  if (!circle) return notFound();
  if (pathname !== basePath) {
    request = await bindCircleSession(db, request, circle.id);
    const actor = await privateActor(db, request, circle.id);
    if (!actor) return notFound();
    // Authenticated write throttle (F2): per-session and per-address buckets
    // so one compromised or scripted session cannot hammer money-affecting
    // writes. Denials are 429 with Retry-After, never a 404 (the caller is
    // already authenticated; there is no oracle to protect here).
    const writeGate = await gateThrottle(db, [
      { key: `write:${actor.userId}`, max: 60 },
      { key: `write-addr:${trustedClientAddress(request)}`, max: 120 },
    ]);
    if (!writeGate.allowed) {
      return new Response(page('Too many tries', '<p>Too many tries. Wait a minute, then try again.</p>'), {
        status: 429,
        headers: headers({ "Content-Type": "text/html; charset=utf-8", "Retry-After": String(writeGate.retryAfter) }),
      });
    }
    // Only the add-item form and the item-photo form may carry a photo.
    const isDraft = pathname === `${basePath}/draft`;
    const isPhotoPost = /^\/items\/[^/]+\/photo$/.test(pathname.slice(basePath.length));
    const multipart = (request.headers.get('content-type') ?? '').startsWith('multipart/form-data');
    if (multipart && !isDraft && !isPhotoPost) return notFound();
    let fields: FormData;
    try { fields = await readForm(request, (isDraft || isPhotoPost) && multipart ? PHOTO_MAX_BYTES + 65_536 : 16_384); } catch { return notFound(); }
    // Idempotency keys for money-affecting writes (F8): the first POST with a
    // key wins; a replay within 24h lands on the ledger that already shows the
    // created entity instead of running the write again. Forms that render no
    // key keep the previous behaviour (rely on 303 + PRG).
    const idempotencyKey = parseIdempotencyKey(fields.get('idempotencyKey')) ?? parseIdempotencyKey(request.headers.get('Idempotency-Key'));
    if (idempotencyKey !== null) {
      const firstSeen = await claimIdempotencyKey(db, idempotencyKey, circle.id, actor.userId);
      if (!firstSeen) {
        return new Response(null, { status: 303, headers: headers({ Location: basePath }) });
      }
    }
    if (pathname === `${basePath}/date`) {
      if (fields.get('intent') !== 'set_event_date') return notFound();
      const draft = String(fields.get('eventDate') ?? '');
      // 422 with the value preserved, never a 403: the person gets their own date back and a
      // sentence about the format, not a verdict on their rights.
      if (!isCalendarDate(draft)) {
        return renderLedger(db, actor, circle.id, basePath, {
          notice: 'Enter a real date, in the form 2026-12-05.', eventDateDraft: draft,
        });
      }
      try {
        await db.withActor(actor, tx => setEventDate(tx, actor, draft));
      } catch (error) {
        if (error instanceof Error && error.message === 'ledger_not_found') return notFound();
        throw error;
      }
      return new Response(null, { status: 303, headers: headers({ Location: basePath }) });
    }
    const cardMatch = pathname.slice(basePath.length).match(/^\/items\/([^/]+)\/card$/);
    if (cardMatch) {
      const itemId = cardMatch[1]!;
      if (actor.role !== 'friend' || !z.uuid().safeParse(itemId).success) return notFound();
      const card = await db.withActor(actor, tx => getCard(tx, actor, itemId));
      if (!card) return notFound();
      if (fields.get('intent') === 'render') return cardPng(db, actor, itemId);
      if (fields.get('intent') === 'pun') {
        try {
          const models = modelsForActor(db, actor, { demoMode: env.DEMO_MODE, apiKey: env.MODEL_API_KEY, baseUrl: env.MODEL_API_BASE_URL });
          await generateCardPun(db, actor, itemId, models);
        } catch (error) {
          if (error instanceof CardNotFoundError) return notFound();
          if (error instanceof CapabilityOffError) return screenResponse('Gift card', createElement(CardComposerScreen, { card, basePath, notice: error.degraded }), 422);
          if (error instanceof Error && ['model_not_configured', 'model_output_rejected', 'model_url_rejected', 'model_spend_unavailable'].includes(error.message)) {
            return screenResponse('Gift card', createElement(CardComposerScreen, { card, basePath, notice: 'Pun suggestions are unavailable right now. The plain card wording still works.' }), 422);
          }
          if (error instanceof Error && error.message === 'model_spend_exceeded') {
            return screenResponse('Gift card', createElement(CardComposerScreen, { card, basePath, notice: 'Pun suggestions are paused for today. The plain card wording still works.' }), 422);
          }
          throw error;
        }
        return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/items/${itemId}/card` }) });
      }
      if (fields.get('intent') !== 'save_entry') return notFound();
      const anonymous = fields.get('anonymous');
      if (anonymous !== null && !['on', 'true', 'false'].includes(String(anonymous))) return notFound();
      const entry = {
        displayNameShown: String(fields.get('displayNameShown') ?? ''),
        message: String(fields.get('message') ?? ''), anonymous: anonymous === 'on' || anonymous === 'true',
      };
      try {
        await db.withActor(actor, tx => saveCardEntry(tx, actor, itemId, entry));
      } catch (error) {
        if (error instanceof CardNotFoundError) return notFound();
        if (error instanceof CardEntryValidationError) return screenResponse('Gift card', createElement(CardComposerScreen, { card: { ...card, myEntry: entry }, basePath, notice: 'Use a name of up to 80 characters unless anonymous, and a message of up to 200 characters. Neither may contain links.' }), 422);
        throw error;
      }
      return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/items/${itemId}/card` }) });
    }
    if (pathname === `${basePath}/registry`) {
      if (actor.role !== 'owner') return notFound();
      const intent = String(fields.get('intent') ?? '');
      const registryItemId = String(fields.get('registryItemId') ?? '');
      const pickerAgain = async (notice: string) => {
        const picker = await loadRegistryPicker(db, actor, circle.id);
        return screenResponse(`Sharing in ${circle.name}`, createElement(RegistryPickerScreen, {
          circleName: circle.name,
          basePath,
          circle: { name: circle.name, role: actor.role },
          available: picker.available,
          linked: picker.linked,
          notice,
        }), 422);
      };
      try {
        if (intent === 'preview') {
          await db.withActor(actor, tx => previewCircleLinks(tx, actor, circle.id));
          return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/registry/preview` }) });
        }
        if (!z.uuid().safeParse(registryItemId).success) return notFound();
        if (intent === 'link') {
          await db.withActor(actor, tx => linkRegistryItem(tx, actor, registryItemId, circle.id));
          return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/registry?linked=1` }) });
        }
        if (intent === 'unlink') {
          await db.withActor(actor, tx => unlinkRegistryItem(tx, actor, registryItemId, circle.id));
          return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/registry` }) });
        }
        if (intent === 'show') {
          await db.withActor(actor, tx => setLinkVisibility(tx, actor, registryItemId, circle.id, true));
          return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/registry` }) });
        }
        if (intent === 'hide') {
          await db.withActor(actor, tx => setLinkVisibility(tx, actor, registryItemId, circle.id, false));
          return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/registry` }) });
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'ledger_not_found') return notFound();
        if (error instanceof Error && error.message === 'ledger_preview_required') {
          return pickerAgain('Preview this circle before showing anything new. Showing stays closed until then.');
        }
        throw error;
      }
      return notFound();
    }
    if (pathname === `${basePath}/draft`) {
      if (fields.get('intent') === 'link_registry') {
        if (actor.role !== 'owner') return notFound();
        const registryItemId = String(fields.get('registryItemId') ?? '');
        if (!z.uuid().safeParse(registryItemId).success) return notFound();
        try {
          await db.withActor(actor, tx => linkRegistryItem(tx, actor, registryItemId, circle.id));
        } catch (error) {
          if (error instanceof Error && error.message === 'ledger_not_found') return notFound();
          throw error;
        }
        return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/registry?linked=1` }) });
      }
      if (fields.get('intent') !== 'confirm') return notFound();
      const draft = {
        title: String(fields.get('title') ?? ''), retailer: String(fields.get('retailer') ?? ''),
        priceMinor: minorField(fields, 'priceAmount', 'priceMinor', String(fields.get('currency') ?? '')), currency: fields.get('currency'),
        ingestEventId: fields.get('ingestEventId') ?? undefined,
      };
      const parsed = z.object({
        title: z.string().trim().min(1).max(200), retailer: z.string().trim().max(200),
        priceMinor: z.union([z.literal(''), centsSchema]).nullable(), currency: z.enum(CURRENCIES),
        ingestEventId: z.uuid().optional(),
      }).safeParse(draft);
      const draftAgain = (notice: string) => screenResponse('Check item details', createElement(DraftConfirmScreen, {
        draft: { id: draft.ingestEventId === undefined ? undefined : String(draft.ingestEventId), title: draft.title, retailer: draft.retailer, priceMinor: null, priceAmount: String(fields.get('priceAmount') ?? ''), currency: String(draft.currency ?? '') }, basePath, role: actor.role, notice,
      }), 422);
      if (!parsed.success) return draftAgain('Enter a title of up to 200 characters, a currency, and a price like 1899 or 249.50, or leave the price blank.');
      // The photo is re-encoded (no EXIF or location) before anything is written to the ledger.
      const upload = fields.get('photo');
      let imagePath: string | undefined;
      if (upload instanceof File && upload.size > 0) {
        try { imagePath = await storePhoto(env.MEDIA_DIR, upload); }
        catch (error) {
          if (error instanceof PhotoRejectedError) return draftAgain('Use a JPEG, PNG or WebP photo under 5 MB, or leave the photo out.');
          throw error;
        }
      }
      if (!imagePath && parsed.data.ingestEventId) imagePath = await carryIntakePhoto(db, actor, parsed.data.ingestEventId, deps);
      try {
        const item = await db.withActor(actor, tx => addItem(tx, actor, {
          title: parsed.data.title, retailer: parsed.data.retailer || undefined,
          priceMinor: typeof parsed.data.priceMinor === 'number' ? parsed.data.priceMinor : undefined,
          currency: parsed.data.currency, ingestEventId: parsed.data.ingestEventId, imagePath,
        }));
        // A repeated confirm returns the first item; its photo stays, this upload goes.
        if (imagePath && item.imagePath !== imagePath) await deletePhoto(env.MEDIA_DIR, imagePath);
        return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/items/${item.id}` }) });
      } catch (error) {
        if (imagePath) await deletePhoto(env.MEDIA_DIR, imagePath);
        if (error instanceof Error && ['ledger_not_found', 'ledger_draft_unavailable'].includes(error.message)) return notFound();
        throw error;
      }
    }
    const photoPostMatch = pathname.slice(basePath.length).match(/^\/items\/([^/]+)\/photo$/);
    if (photoPostMatch) {
      const itemId = photoPostMatch[1]!;
      if (!z.uuid().safeParse(itemId).success || fields.get('intent') !== 'set_photo') return notFound();
      const upload = fields.get('photo');
      if (!(upload instanceof File) || upload.size === 0) return notFound();
      const circleContext = { name: circle.name, role: actor.role };
      let newPath: string;
      try { newPath = await storePhoto(env.MEDIA_DIR, upload); }
      catch (error) {
        if (error instanceof PhotoRejectedError) {
          if (actor.role === 'owner') {
            const view = await db.withActor(actor, tx => ownerCircleView(tx, circle.id));
            const item = view?.items.find(row => row.id === itemId);
            return item ? screenResponse(item.title, createElement(OwnerItemScreen, { item, basePath, circle: circleContext }), 422) : notFound();
          }
          const view = await db.withActor(actor, tx => friendCircleView(tx, circle.id, actor.userId));
          const item = view?.items.find(row => row.id === itemId);
          return item ? screenResponse(item.title, createElement(ItemDetailScreen, { item, basePath, notice: 'Use a JPEG, PNG or WebP photo under 5 MB, or leave the photo out.', circle: circleContext }), 422) : notFound();
        }
        throw error;
      }
      const oldRow = await db.withActor(actor, tx => tx.item.findFirst({ where: { id: itemId, circleId: circle.id }, select: { imagePath: true } })).catch(() => null);
      try {
        await db.withActor(actor, tx => setItemPhoto(tx, actor, itemId, newPath));
      } catch (error) {
        await deletePhoto(env.MEDIA_DIR, newPath);
        if (error instanceof Error && error.message === 'ledger_not_found') return notFound();
        throw error;
      }
      if (oldRow?.imagePath && oldRow.imagePath !== newPath) await deletePhoto(env.MEDIA_DIR, oldRow.imagePath);
      return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/items/${itemId}` }) });
    }
    const itemMatch = pathname.slice(basePath.length).match(/^\/items\/([^/]+)$/);
    if (itemMatch) {
      const itemId = itemMatch[1]!;
      if (actor.role !== 'friend' || !z.uuid().safeParse(itemId).success) return notFound();
      const view = await db.withActor(actor, tx => friendCircleView(tx, circle.id, actor.userId));
      const item = view?.items.find(row => row.id === itemId);
      if (!item) return notFound();
      const intent = z.enum(['claim', 'release', 'create_pool', 'contribute', 'mark_paid', 'purchase', 'reveal', 'save_payout']).safeParse(fields.get('intent'));
      if (!intent.success) return notFound();
      const moneyIntent = intent.data === 'create_pool' || intent.data === 'contribute';
      // Money is always in the item's currency; a pool inherits it.
      const moneyCurrency = intent.data === 'create_pool' ? item.currency : item.pool?.currency ?? item.currency;
      const amount = positiveCentsSchema.safeParse(intent.data === 'create_pool' ? minorField(fields, 'targetAmount', 'targetMinor', moneyCurrency) : minorField(fields, 'pledgeAmount', 'amountMinor', moneyCurrency));
      if (moneyIntent && (!amount.success || fields.get('currency') !== moneyCurrency)) {
        return itemError(item, basePath, 'Enter an amount above zero, like 400 or 99.50.', 422);
      }
      // Bank details are the buyer's own words about their own account, shaped
      // like an invoice payee block. The ledger re-checks the digits; this
      // answers 422 so a typo comes back with the form, not a blank 404.
      const payout = intent.data === 'save_payout' ? z.object({
        accountHolder: z.string().trim().min(1).max(80),
        bankName: z.string().trim().min(1).max(80),
        accountNumber: z.string().trim().min(6).max(24),
        branchCode: z.string().trim().min(6).max(9),
        accountType: z.enum(['cheque', 'savings', 'transmission']).optional(),
        referencePrefix: z.string().trim().max(12).optional(),
        shareConsent: z.literal('on').optional(),
      }).safeParse({
        accountHolder: String(fields.get('accountHolder') ?? ''),
        bankName: String(fields.get('bankName') ?? ''),
        accountNumber: String(fields.get('accountNumber') ?? ''),
        branchCode: String(fields.get('branchCode') ?? ''),
        accountType: String(fields.get('accountType') ?? '') || undefined,
        referencePrefix: String(fields.get('referencePrefix') ?? '') || undefined,
        shareConsent: fields.get('shareConsent') === 'on' ? 'on' : undefined,
      }) : null;
      if (intent.data === 'save_payout' && !payout!.success) {
        return itemError(item, basePath, 'Check the bank details: account holder, bank, a 6–20 digit account number and a 6-digit branch code.', 422);
      }
      // RN-E: an archived proxy circle stays readable but takes no new
      // claims, pledges or payout edits. Settling what exists (release, mark
      // paid, purchase) stays possible; the ledger is never destroyed.
      const newMoneyIntent = ['claim', 'create_pool', 'contribute', 'save_payout'].includes(intent.data);
      if (newMoneyIntent && isArchived(circle)) {
        return itemError(item, basePath, 'This circle has archived, so it is not taking new claims or pledges.', 409);
      }
      const poolIntent = ['contribute', 'mark_paid', 'purchase', 'save_payout'].includes(intent.data);
      const poolId = String(fields.get('poolId') ?? '');
      if (poolIntent && !validUuid(poolId)) return notFound();
      // Marking someone else paid is the buyer's act only: anyone else naming
      // a user reads exactly like nothing, and a self-name takes the ordinary
      // self-mark path, so a forged field cannot escalate.
      const markPaidUserId = intent.data === 'mark_paid' ? String(fields.get('userId') ?? '') : '';
      const isBuyerMarkingOther = markPaidUserId !== '' && markPaidUserId !== actor.userId;
      if (isBuyerMarkingOther && !validUuid(markPaidUserId)) return notFound();
      try {
        await db.withActor(actor, async tx => {
          if (poolIntent && !await tx.pool.findFirst({ where: { id: poolId, itemId } })) throw new Error('ledger_not_found');
          switch (intent.data) {
            case 'claim': await claimItem(tx, actor, itemId); break;
            case 'release': await releaseClaim(tx, actor, itemId); break;
            case 'create_pool': await createPool(tx, actor, itemId, amount.data!); break;
            case 'contribute': await contribute(tx, actor, poolId, amount.data!); break;
            case 'mark_paid':
              if (isBuyerMarkingOther) await markPaidFor(tx, actor, poolId, markPaidUserId);
              else await markPaid(tx, actor, poolId);
              break;
            case 'purchase': await purchasePool(tx, actor, poolId); break;
            case 'reveal': await revealItem(tx, actor, itemId); break;
            case 'save_payout': {
              const details = payout!.data!;
              await savePayout(tx, actor, poolId, {
                accountHolder: details.accountHolder,
                bankName: details.bankName,
                accountNumber: details.accountNumber,
                branchCode: details.branchCode,
                accountType: details.accountType ?? null,
                referencePrefix: details.referencePrefix ?? null,
                shareConsent: details.shareConsent === 'on',
              });
              break;
            }
          }
        });
      } catch (error) {
        if (error instanceof Error && ['ledger_not_found', 'ledger_role_denied', 'ledger_buyer_required'].includes(error.message)) return notFound();
        if (error instanceof Error && ['ledger_item_unavailable', 'ledger_item_reserved', 'ledger_claim_unavailable', 'ledger_contribution_conflict', 'ledger_pool_unavailable', 'ledger_pool_not_paid', 'ledger_contribution_unavailable', 'ledger_invalid_payout'].includes(error.message)) {
          const payoutError = intent.data === 'save_payout';
          return itemError(item, basePath, payoutError ? 'Check the bank details: account holder, bank, a 6–20 digit account number and a 6-digit branch code.' : 'This gift or contribution has changed. Return to the circle and review it before trying again.', payoutError ? 422 : 409);
        }
        throw error;
      }
      return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/items/${itemId}` }) });
    }
    if (pathname === `${basePath}/requests`) {
      // RN-J: the owner decides, in their own projection, when they next
      // open their link. Nothing was sent to get them here.
      if (actor.role !== 'owner') return notFound();
      const decision = z.enum(['accept', 'reject']).safeParse(fields.get('intent'));
      const requestId = String(fields.get('requestId') ?? '');
      if (!decision.success || !z.uuid().safeParse(requestId).success) return notFound();
      const outcome = await db.withActor(actor, async (tx) => {
        const row = await tx.allowlistEntry.findFirst({
          where: { id: requestId, circleId: circle.id },
          select: { id: true, status: true, requesterName: true },
        });
        if (!row) return 'missing' as const;
        if (row.requesterName === null) return 'already' as const;
        if (decision.data === 'accept') {
          // Approval turns the request into an ordinary invitation: the
          // requester can now pass the gate, which flips it to accepted.
          await tx.allowlistEntry.update({ where: { id: row.id }, data: { requesterName: null } });
        } else {
          // `removed` is already the gate's word for "not an invite", and a
          // DELETE policy for the owner role does not exist by design.
          await tx.allowlistEntry.update({ where: { id: row.id }, data: { status: 'removed' } });
        }
        return 'done' as const;
      });
      if (outcome === 'missing') return notFound();
      return new Response(null, { status: 303, headers: headers({ Location: basePath }) });
    }
    if (pathname !== `${basePath}/settings`) return notFound();
    const setting = z.object({ intent: z.literal('toggle'), capability: z.enum(AI_CAPABILITIES), enabled: z.enum(['true', 'false']) }).safeParse({ intent: fields.get('intent'), capability: fields.get('capability'), enabled: fields.get('enabled') });
    if (!setting.success) return screenResponse('Settings', createElement(Screen, { title: 'Settings', backHref: `${basePath}/settings`, children: 'Choose a valid capability and on or off setting.' }), 422);
    await db.withActor(actor, tx => setCapability(tx, actor, setting.data.capability, setting.data.enabled === 'true'));
    return new Response(null, { status: 303, headers: headers({ Location: `${basePath}/settings` }) });
  }

  let name = "";
  let phone = "";
  let intent = "";
  let turnstileToken: string | null = null;
  try {
    const form = await readForm(request);
    name = String(form.get("name") ?? "").trim();
    phone = String(form.get("phone") ?? "").trim();
    intent = String(form.get("intent") ?? "");
    turnstileToken = turnstileField(form);
  } catch {
    return gateForm("That submission did not come through. Try again.");
  }

  const normalized = normalizeE164(phone);
  if (!name || name.length > 80 || !normalized) {
    return gateForm("Add the name you want on the card, and the number in full international form.");
  }

  // Human-proof gate (F12): same indistinguishable "no" as an uninvited
  // number, so the check cannot walk the phone list. Open seam until
  // TURNSTILE_SECRET is set; enforced from the first external user on.
  if (!(await checkTurnstile(request, turnstileToken))) {
    return rejectedForm(name, phone);
  }

  const pepper = env.PHONE_HASH_PEPPER;
  const phoneHash = hashPhone(normalized, pepper);

  // M-02: count every attempt before the lookup, successes and failures alike. The key is
  // circle + phone hash + trusted address — never a raw number — and the denial is the
  // same for invited and uninvited numbers, so throttling cannot walk the phone list.
  // The address comes from `trustedClientAddress` (RN-D Gate 3): an untrusted X-Forwarded-For
  // is a claim, not evidence, and keying on it lets one caller mint unlimited keys.
  // Rotation-resistant: the pair key, an address-only key and a global per-number key
  // must ALL allow, so rotating numbers (or headers) cannot bypass the gate.
  // Shared across processes behind the proxy via `gateThrottle` (F2).
  // This single mount also covers the RN-J request branch below.
  const gateAddress = trustedClientAddress(request);
  const throttle = await gateThrottle(db, [
    `gate:${circle.id}:${phoneHash}:${gateAddress}`,
    { key: `gate-addr:${gateAddress}`, max: 60 },
    { key: `gate-number:${phoneHash}`, max: 20 },
  ]);
  if (!throttle.allowed) {
    console.warn("gate_throttled", { circleId: circle.id, retryAfter: throttle.retryAfter });
    const form = gateForm("Too many tries. Wait a minute, then try again.");
    return new Response(form.body, {
      status: 429,
      headers: headers({ "Content-Type": "text/html; charset=utf-8", "Retry-After": String(throttle.retryAfter) }),
    });
  }

  // RN-J: asking for access. The answer is the gate's ordinary "no" whether
  // or not anyone is listening: a proxy circle has nobody to ask, and a real
  // owner merely finds the request next time they open their own link.
  // Nothing is sent.
  if (intent === "request_access") {
    if (circle.ownerUserId !== null) {
      const existing = await db.prisma.allowlistEntry.findUnique({
        where: { circleId_phoneE164Hash: { circleId: circle.id, phoneE164Hash: phoneHash } },
        select: { id: true, status: true, requesterName: true },
      });
      if (!existing) {
        await db.prisma.allowlistEntry.create({
          data: {
            circleId: circle.id, phoneE164Hash: phoneHash, addedBy: circle.ownerUserId,
            status: "pending", requesterName: name,
          },
        });
      } else if (existing.status !== "accepted") {
        await db.prisma.allowlistEntry.update({
          where: { id: existing.id },
          data: { status: "pending", requesterName: name, createdAt: new Date() },
        });
      }
    }
    return rejectedForm(name, phone);
  }

  // Authorise before writing anything. `removed` is not an invite, and a
  // pending *request* (requesterName set) is not an invite either: only the
  // owner's approval, which clears that marker, makes it one.
  const invited = await db.prisma.allowlistEntry.findUnique({
    where: { circleId_phoneE164Hash: { circleId: circle.id, phoneE164Hash: phoneHash } },
    select: { id: true, status: true, requesterName: true },
  });
  if (!invited || invited.status === "removed" || invited.requesterName !== null) {
    // One message for every kind of no, so this form cannot be used to walk a phone list.
    console.warn("gate_denied", { circleId: circle.id });
    return rejectedForm(name, phone);
  }

  const session = await db.prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { phoneE164: normalized },
      create: { phoneE164: normalized, displayName: name },
      update: { displayName: name },
    });

    await tx.membership.upsert({
      where: { circleId_userId: { circleId: circle.id, userId: user.id } },
      create: { circleId: circle.id, userId: user.id, role: "friend", status: "active" },
      update: { status: "active" },
    });

    if (invited.status === "pending") {
      await tx.allowlistEntry.update({ where: { id: invited.id }, data: { status: "accepted" } });
    }

    return issueSession({ userId: user.id, circleId: circle.id, role: "friend" });
  });

  const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  // 303, not 302: a redirect after a POST must become a GET, or a refresh re-submits the form.
  return new Response(null, {
    status: 303,
    headers: headers({ Location: `/c/${encodeURIComponent(slug)}`, "Set-Cookie": sessionCookie(session, expiry) }),
  });
}

function unavailable(error: unknown): Response {
  console.error('circle_request_unavailable', error instanceof Error ? error.name : 'UnknownError');
  return screenResponse('Circle unavailable', createElement(Screen, { title: 'Circle unavailable', children: 'This request could not be completed. Try again shortly.' }), 503);
}

export async function handleCircleGet(db: Db, request: Request, slug: string): Promise<Response> {
  try { return applyRefresh(request, await circleGet(db, request, slug)); } catch (error) { return unavailable(error); }
}

export async function handleCirclePost(db: Db, request: Request, slug: string, deps: CircleRouteDeps = {}): Promise<Response> {
  try { return applyRefresh(request, await circlePost(db, request, slug, deps)); } catch (error) { return unavailable(error); }
}
