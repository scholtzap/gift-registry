import { createElement, type ReactNode } from "react";
import { createRequire } from 'node:module';
import { z } from 'zod';
import type { Actor, Db } from "@/server/db/client";
import { FriendLedgerScreen } from "@/components/screens/friend-ledger";
import { OwnerLedgerScreen, OwnerItemScreen } from "@/components/screens/owner-ledger";
import { JoinScreen } from "@/components/screens/join";
import { SettingsScreen } from "@/components/screens/settings";
import { DraftConfirmScreen } from '@/components/screens/draft-confirm';
import { ItemDetailScreen } from '@/components/screens/item-detail';
import { CardComposerScreen } from '@/components/screens/card-composer';
import { CardEntryValidationError, CardNotFoundError, generateCardPun, getCard, renderCardVariant, saveCardEntry } from '@/server/cards';
import { modelsForActor } from '@/server/models/client';
import { Screen } from '@/components/ui';
import { friendCircleView, ownerCircleView } from "@/server/views";
import { hashPhone, normalizeE164 } from "@/server/auth/phone-hash";
import { checkGateThrottle } from "@/server/auth/throttle";
import { issueSession, sessionCookie, sessionFromRequest } from "@/server/auth/session";
import { AI_CAPABILITIES, assertCan, CAPABILITY_COPY, CapabilityOffError, setCapability } from "@/server/entitlements";
import { addItem, claimItem, contribute, createPool, markPaid, purchasePool, releaseClaim, revealItem, setEventDate } from '@/server/ledger';
import { isCalendarDate } from '@/lib/dates';
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
  return { 'Cache-Control': NO_STORE, 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', ...extra };
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
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
function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#ffffff">
<meta name="application-name" content="Piñata">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Piñata">
<link rel="icon" href="/icon.png">
<link rel="apple-touch-icon" href="/apple-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/pinata.css">
<script src="/register-sw.js" defer></script>
<title>${escapeHtml(title)} · Piñata</title></head>
<body>
${body}</body></html>`;
}

function gateForm(notice?: string): Response {
  return new Response(page('Join this circle', renderToStaticMarkup(createElement(JoinScreen, { notice }))), {
    status: 200, headers: headers({ 'Content-Type': 'text/html; charset=utf-8' }),
  });
}

function renderOwner(view: NonNullable<Awaited<ReturnType<typeof ownerCircleView>>>, basePath: string, date?: { notice?: string; eventDateDraft?: string | null }): Response {
  return new Response(page(view.name, renderToStaticMarkup(createElement(OwnerLedgerScreen, { view, basePath, ...date }))), {
    status: date?.notice ? 422 : 200,
    headers: headers({ 'Content-Type': 'text/html; charset=utf-8' }),
  });
}

function renderFriend(view: NonNullable<Awaited<ReturnType<typeof friendCircleView>>>, basePath: string, date?: { notice?: string; eventDateDraft?: string | null }): Response {
  return new Response(
    page(view.name, renderToStaticMarkup(createElement(FriendLedgerScreen, { view, basePath, ...date }))),
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
  if (actor.role === 'owner') {
    const view = await db.withActor(actor, tx => ownerCircleView(tx, circleId));
    return view === null ? notFound() : renderOwner(view, basePath, date);
  }
  const view = await db.withActor(actor, tx => friendCircleView(tx, circleId, actor.userId));
  return view === null ? notFound() : renderFriend(view, basePath, date);
}

function screenResponse(title: string, content: ReactNode, status = 200): Response {
  return new Response(page(title, renderToStaticMarkup(content)), {
    status, headers: headers({ 'Content-Type': 'text/html; charset=utf-8' }),
  });
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
    currency: z.literal('ZAR'),
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

async function circleGet(db: Db, request: Request, slug: string): Promise<Response> {
  const basePath = `/c/${encodeURIComponent(slug)}`;
  const pathname = new URL(request.url).pathname;
  const circle = await db.prisma.circle.findUnique({ where: { shareSlug: slug }, select: { id: true, name: true } });
  if (!circle) return notFound();
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
    return screenResponse('Review your draft', createElement(DraftConfirmScreen, { draft, basePath, role: actor.role, circle: circleContext }));
  }
  const cardMatch = pathname.slice(basePath.length).match(/^\/items\/([^/]+)\/card(\/png)?$/);
  if (cardMatch) {
    const itemId = cardMatch[1]!;
    if (actor.role !== 'friend' || !z.uuid().safeParse(itemId).success) return notFound();
    const card = await db.withActor(actor, tx => getCard(tx, actor, itemId));
    if (!card) return notFound();
    if (cardMatch[2]) return cardPng(db, actor, itemId, new URL(request.url).searchParams.get('variant'));
    return screenResponse('Gift card', createElement(CardComposerScreen, { card, basePath, circle: circleContext }));
  }
  const photoMatch = pathname.slice(basePath.length).match(/^\/items\/([^/]+)\/photo$/);
  if (photoMatch) {
    const itemId = photoMatch[1]!;
    if (!z.uuid().safeParse(itemId).success) return notFound();
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
  const itemMatch = pathname.slice(basePath.length).match(/^\/items\/([^/]+)$/);
  if (itemMatch) {
    const itemId = itemMatch[1]!;
    if (!z.uuid().safeParse(itemId).success) return notFound();
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

/**
 * Login-CSRF guard for the one endpoint that *issues* a session.
 *
 * `SameSite=Lax` is a product requirement here (the click comes out of WhatsApp's in-app browser as a
 * top-level GET), and Lax protects an existing cookie from riding on a cross-site POST — but this
 * handler does not read a cookie to authorise anything, it mints one. A plain HTML form POST is a
 * CORS "simple request" (no preflight) and browsers accept `Set-Cookie` from the response, so an
 * attacker who knows an allow-listed number can log their *victim* into the attacker's circle from the
 * victim's own browser. SameSite cannot see that, and neither can RLS: the session is genuinely the
 * victim's.
 *
 * Origin (or Referer, which some browsers strip the other way round) has to name this app's own
 * origin. Modern browsers send `Origin` on every same-origin POST, so a real form submit always
 * passes; a non-browser caller with no header at all is refused rather than trusted.
 */
function isSameOrigin(request: Request): boolean {
  const candidate = request.headers.get('origin') ?? request.headers.get('referer');
  if (!candidate) return false;
  try {
    return new URL(candidate).origin === new URL(env.CIRCLE_BASE_URL).origin;
  } catch {
    return false;
  }
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

async function circlePost(db: Db, request: Request, slug: string): Promise<Response> {
  const basePath = `/c/${encodeURIComponent(slug)}`;
  const pathname = new URL(request.url).pathname;
  if (!isSameOrigin(request)) {
    return pathname === basePath ? gateForm('That submission could not be verified as coming from this page. Open the link again and try.') : notFound();
  }

  const circle = await db.prisma.circle.findUnique({
    where: { shareSlug: slug },
    select: { id: true, status: true, createdAt: true, eventDate: true, ownerUserId: true },
  });
  if (!circle) return notFound();
  if (pathname !== basePath) {
    const actor = await privateActor(db, request, circle.id);
    if (!actor) return notFound();
    // Only the add-item form may carry a photo, so only it gets a multipart-sized body.
    const isDraft = pathname === `${basePath}/draft`;
    const multipart = (request.headers.get('content-type') ?? '').startsWith('multipart/form-data');
    if (multipart && !isDraft) return notFound();
    let fields: FormData;
    try { fields = await readForm(request, isDraft && multipart ? PHOTO_MAX_BYTES + 65_536 : 16_384); } catch { return notFound(); }
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
          if (error instanceof Error && ['model_not_configured', 'model_output_rejected', 'model_url_rejected'].includes(error.message)) {
            return screenResponse('Gift card', createElement(CardComposerScreen, { card, basePath, notice: 'Pun suggestions are unavailable right now. The plain card wording still works.' }), 422);
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
    if (pathname === `${basePath}/draft`) {
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
    const itemMatch = pathname.slice(basePath.length).match(/^\/items\/([^/]+)$/);
    if (itemMatch) {
      const itemId = itemMatch[1]!;
      if (actor.role !== 'friend' || !z.uuid().safeParse(itemId).success) return notFound();
      const view = await db.withActor(actor, tx => friendCircleView(tx, circle.id, actor.userId));
      const item = view?.items.find(row => row.id === itemId);
      if (!item) return notFound();
      const intent = z.enum(['claim', 'release', 'create_pool', 'contribute', 'mark_paid', 'purchase', 'reveal']).safeParse(fields.get('intent'));
      if (!intent.success) return notFound();
      const moneyIntent = intent.data === 'create_pool' || intent.data === 'contribute';
      // Money is always in the item's currency; a pool inherits it.
      const moneyCurrency = intent.data === 'create_pool' ? item.currency : item.pool?.currency ?? item.currency;
      const amount = positiveCentsSchema.safeParse(intent.data === 'create_pool' ? minorField(fields, 'targetAmount', 'targetMinor', moneyCurrency) : minorField(fields, 'pledgeAmount', 'amountMinor', moneyCurrency));
      if (moneyIntent && (!amount.success || fields.get('currency') !== moneyCurrency)) {
        return screenResponse(item.title, createElement(ItemDetailScreen, { item, basePath, notice: 'Enter an amount above zero, like 400 or 99.50.' }), 422);
      }
      // RN-E: an archived proxy circle stays readable but takes no new
      // claims or pledges. Settling what already exists (release, mark
      // paid, purchase) stays possible; the ledger is never destroyed.
      const newMoneyIntent = ['claim', 'create_pool', 'contribute'].includes(intent.data);
      if (newMoneyIntent && isArchived(circle)) {
        return screenResponse(item.title, createElement(ItemDetailScreen, { item, basePath, notice: 'This circle has archived, so it is not taking new claims or pledges.' }), 409);
      }
      const poolIntent = ['contribute', 'mark_paid', 'purchase'].includes(intent.data);
      const poolId = String(fields.get('poolId') ?? '');
      if (poolIntent && !z.uuid().safeParse(poolId).success) return notFound();
      try {
        await db.withActor(actor, async tx => {
          if (poolIntent && !await tx.pool.findFirst({ where: { id: poolId, itemId } })) throw new Error('ledger_not_found');
          switch (intent.data) {
            case 'claim': await claimItem(tx, actor, itemId); break;
            case 'release': await releaseClaim(tx, actor, itemId); break;
            case 'create_pool': await createPool(tx, actor, itemId, amount.data!); break;
            case 'contribute': await contribute(tx, actor, poolId, amount.data!); break;
            case 'mark_paid': await markPaid(tx, actor, poolId); break;
            case 'purchase': await purchasePool(tx, actor, poolId); break;
            case 'reveal': await revealItem(tx, actor, itemId); break;
          }
        });
      } catch (error) {
        if (error instanceof Error && ['ledger_not_found', 'ledger_role_denied', 'ledger_buyer_required'].includes(error.message)) return notFound();
        if (error instanceof Error && ['ledger_item_unavailable', 'ledger_item_reserved', 'ledger_claim_unavailable', 'ledger_contribution_conflict', 'ledger_pool_unavailable', 'ledger_pool_not_paid', 'ledger_contribution_unavailable'].includes(error.message)) {
          return screenResponse(item.title, createElement(ItemDetailScreen, { item, basePath, notice: 'This gift or contribution has changed. Return to the circle and review it before trying again.' }), 409);
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
  try {
    const form = await readForm(request);
    name = String(form.get("name") ?? "").trim();
    phone = String(form.get("phone") ?? "").trim();
    intent = String(form.get("intent") ?? "");
  } catch {
    return gateForm("That submission did not come through. Try again.");
  }

  const normalized = normalizeE164(phone);
  if (!name || name.length > 80 || !normalized) {
    return gateForm("Add the name you want on the card, and the number in full international form.");
  }

  const pepper = env.PHONE_HASH_PEPPER;
  const phoneHash = hashPhone(normalized, pepper);

  // M-02: count every attempt before the lookup, successes and failures alike. The key is
  // circle + phone hash + forwarded address — never a raw number — and the denial is the
  // same for invited and uninvited numbers, so throttling cannot walk the phone list.
  // This single mount also covers the RN-J request branch below.
  const address = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const throttle = checkGateThrottle(`${circle.id}:${phoneHash}:${address}`);
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
    return gateForm("We could not let you in with that number.");
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
    return gateForm("We could not let you in with that number.");
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
  try { return await circleGet(db, request, slug); } catch (error) { return unavailable(error); }
}

export async function handleCirclePost(db: Db, request: Request, slug: string): Promise<Response> {
  try { return await circlePost(db, request, slug); } catch (error) { return unavailable(error); }
}
