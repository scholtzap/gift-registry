import { createElement } from "react";
import { createRequire } from "node:module";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { trustedClientAddress } from "@/server/auth/client-address";
import { isSameOrigin } from "@/server/auth/same-origin";
import { gateThrottle } from "@/server/auth/throttle-store";
import { sessionFromRequest } from "@/server/auth/session";
import { CONTENT_SECURITY_POLICY, page } from "@/server/routes/shell";
import { loadDashboard } from "@/server/views/dashboard";
import { DashboardScreen } from "@/components/screens/dashboard";
import { createRegistryItem, setRegistryItemPhoto, setRegistryItemPrivate } from "@/server/ledger/registry";
import { env } from "@/lib/env";
import { CURRENCIES, parseAmountToMinor } from "@/lib/money";
import { PHOTO_MAX_BYTES, PhotoRejectedError, deletePhoto, storePhoto } from "@/server/photos";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as typeof import("react-dom/server");

/**
 * `/app` registry writes (docs/plans/shared-registry-and-circles.md Q3, Q7).
 * The receiver manages canonical wishes from the dashboard, never from a
 * circle projection: friend sessions and strangers get the uniform 404, so
 * this route never confirms who holds a registry.
 */

const NO_STORE = "private, no-store, max-age=0, must-revalidate";
const BASE = process.env.PINATA_BASE_PATH ?? "";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Cache-Control": NO_STORE,
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    ...extra,
  };
}

function notFound(): Response {
  return new Response(page("Not found", "<p>That page is not valid.</p>"), {
    status: 404,
    headers: headers({ "Content-Type": "text/html; charset=utf-8" }),
  });
}

async function dashboard422(db: Db, request: Request, notice: string): Promise<Response> {
  const dashboard = await loadDashboard(db, sessionFromRequest(request));
  if (!dashboard) return notFound();
  const body = page("Your registry and circles", renderToStaticMarkup(
    createElement(DashboardScreen, { view: dashboard, basePath: BASE, notice }),
  ));
  return new Response(body, { status: 422, headers: headers({ "Content-Type": "text/html; charset=utf-8" }) });
}

async function readForm(request: Request, limit = 16_384): Promise<FormData> {
  if (!request.body) throw new Error("missing_form");
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
        throw new Error("form_too_large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return new Response(body, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
}

const uuid = z.string().refine((v) => z.uuid().safeParse(v).success);

export async function handleRegistryPost(db: Db, request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  // No registry view for friends, and no oracle for strangers: every kind of
  // no is the same 404 (Q3).
  if (!session || session.role !== "owner") return notFound();
  if (!isSameOrigin(request)) {
    return dashboard422(db, request, "That submission could not be verified as coming from this page. Open it again and try.");
  }

  const actor = { role: "owner" as const, userId: session.userId, circleId: session.circleId };
  const gate = await gateThrottle(db, [
    { key: `registry:${session.userId}`, max: 30 },
    { key: `registry-addr:${trustedClientAddress(request)}`, max: 120 },
  ]);
  if (!gate.allowed) {
    return dashboard422(db, request, "Too many tries. Wait a minute, then try again.");
  }

  const multipart = (request.headers.get("content-type") ?? "").startsWith("multipart/form-data");
  let fields: FormData;
  try {
    fields = await readForm(request, multipart ? PHOTO_MAX_BYTES + 65_536 : 16_384);
  } catch {
    return dashboard422(db, request, "That submission did not come through. Try again.");
  }

  const intent = String(fields.get("intent") ?? "");
  try {
    if (intent === "create_item") {
      const title = String(fields.get("title") ?? "").trim();
      const retailer = String(fields.get("retailer") ?? "").trim();
      const currencyRaw = String(fields.get("currency") ?? "");
      const priceRaw = String(fields.get("priceAmount") ?? "").trim();
      const bad = "Check the wish: a title of up to 200 characters, a currency, and a price like 1899 or 249.50, or leave the price blank.";
      if (!title || title.length > 200 || retailer.length > 200) return dashboard422(db, request, bad);
      if (!CURRENCIES.includes(currencyRaw as (typeof CURRENCIES)[number])) return dashboard422(db, request, bad);
      const currency = currencyRaw as (typeof CURRENCIES)[number];
      let priceMinor: number | undefined;
      if (priceRaw !== "") {
        const parsed = parseAmountToMinor(priceRaw, currency);
        if (parsed === null) return dashboard422(db, request, bad);
        priceMinor = parsed;
      }
      const upload = fields.get("photo");
      let imagePath: string | undefined;
      if (upload instanceof File && upload.size > 0) {
        try {
          imagePath = await storePhoto(env.MEDIA_DIR, upload);
        } catch (error) {
          if (error instanceof PhotoRejectedError) {
            return dashboard422(db, request, "Use a JPEG, PNG or WebP photo under 5 MB, or leave the photo out.");
          }
          throw error;
        }
      }
      try {
        await db.withActor(actor, (tx) => createRegistryItem(tx, actor, {
          title, retailer: retailer || undefined, priceMinor, currency,
          ...(imagePath ? { imagePath } : {}),
        }));
      } catch (error) {
        if (imagePath) await deletePhoto(env.MEDIA_DIR, imagePath);
        if (error instanceof Error && error.message === "ledger_not_found") return notFound();
        throw error;
      }
      return new Response(null, { status: 303, headers: headers({ Location: `${BASE}/app` }) });
    }

    if (intent === "set_private") {
      const parsed = z.object({ itemId: uuid, flag: z.enum(["on", "off"]) }).safeParse({
        itemId: String(fields.get("itemId") ?? ""), flag: String(fields.get("private") ?? ""),
      });
      if (!parsed.success) return notFound();
      try {
        await db.withActor(actor, (tx) =>
          setRegistryItemPrivate(tx, actor, parsed.data.itemId, parsed.data.flag === "on"),
        );
      } catch (error) {
        if (error instanceof Error && error.message === "ledger_not_found") return notFound();
        throw error;
      }
      return new Response(null, { status: 303, headers: headers({ Location: `${BASE}/app` }) });
    }

    if (intent === "set_photo") {
      const itemId = String(fields.get("itemId") ?? "");
      if (!z.uuid().safeParse(itemId).success) return notFound();
      const upload = fields.get("photo");
      if (!(upload instanceof File) || upload.size === 0) {
        return dashboard422(db, request, "Choose a photo first, or leave the photo out.");
      }
      let imagePath: string;
      try {
        imagePath = await storePhoto(env.MEDIA_DIR, upload);
      } catch (error) {
        if (error instanceof PhotoRejectedError) {
          return dashboard422(db, request, "Use a JPEG, PNG or WebP photo under 5 MB, or leave the photo out.");
        }
        throw error;
      }
      const old = await db.withActor(actor, (tx) =>
        tx.registryItem.findFirst({ where: { id: itemId }, select: { imagePath: true } }),
      ).catch(() => null);
      try {
        await db.withActor(actor, (tx) => setRegistryItemPhoto(tx, actor, itemId, imagePath));
      } catch (error) {
        await deletePhoto(env.MEDIA_DIR, imagePath);
        if (error instanceof Error && error.message === "ledger_not_found") return notFound();
        throw error;
      }
      if (old?.imagePath && old.imagePath !== imagePath) await deletePhoto(env.MEDIA_DIR, old.imagePath);
      return new Response(null, { status: 303, headers: headers({ Location: `${BASE}/app` }) });
    }

    return notFound();
  } catch {
    return dashboard422(db, request, "This request could not be completed. Try again shortly.");
  }
}
