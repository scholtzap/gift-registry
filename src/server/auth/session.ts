import { createHmac, timingSafeEqual } from "node:crypto";
import type { ActorRole } from "@/server/db/client";
import { env } from "@/lib/env";

/**
 * The web half of the product has no password to check. The credential is "Meta already
 * verified this person on an authenticated WhatsApp thread", or "this person proved
 * possession of an allow-listed number" — neither of which any auth library models, and every
 * candidate library either ignores WhatsApp delivery or owns identity tables outside the RLS
 * boundary this app's privacy model depends on. So the session is a signed cookie and nothing
 * else. See `docs/plans/user-management-and-billing-path.md`.
 *
 * The payload carries the role rather than deriving it per request. That is safe because the
 * signature is the authority, and RLS is the backstop: `app_actor_owns_circle` and
 * `app_actor_joined_circle` re-read the actual membership on every query, so a cookie that
 * outlives a demotion or a removal yields zero rows and the route turns that into a 404.
 */

export const SESSION_COOKIE = "gc_session";

/** Long enough to outlive a circle link sitting in a WhatsApp group; short enough that a
 *  stolen cookie on a shared phone stops working. Clicking the link again re-mints it. */
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;

interface SessionPayload {
  /** Bumped when the payload shape changes, so an old cookie is rejected rather than misread. */
  v: 1;
  u: string;
  c: string;
  r: ActorRole;
  /** Expiry, seconds since epoch. */
  e: number;
}

export interface Session {
  userId: string;
  circleId: string;
  role: ActorRole;
  expiresAt: Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function mac(body: string): Buffer {
  return createHmac("sha256", env.SESSION_SECRET).update(body).digest();
}

export function issueSession(input: { userId: string; circleId: string; role: ActorRole }, now = Date.now()): string {
  const payload: SessionPayload = {
    v: 1,
    u: input.userId,
    c: input.circleId,
    r: input.role,
    e: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  };
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${base64url(mac(body))}`;
}

/** Returns null for every kind of no — forged, truncated, expired, wrong version, malformed
 *  ids. The caller cannot distinguish them and must not try: a route that says "expired"
 *  versus "invalid" is a route that tells an attacker which half of the token to guess. */
export function readSession(token: string | undefined, now = Date.now()): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = mac(body);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;

  const p = payload as Partial<SessionPayload>;
  if (p.v !== 1) return null;
  if (typeof p.u !== "string" || !UUID_RE.test(p.u)) return null;
  if (typeof p.c !== "string" || !UUID_RE.test(p.c)) return null;
  if (p.r !== "owner" && p.r !== "friend") return null;
  if (typeof p.e !== "number" || p.e * 1000 <= now) return null;

  return { userId: p.u, circleId: p.c, role: p.r, expiresAt: new Date(p.e * 1000) };
}

export function sessionCookie(token: string, expiresAt: Date): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    // Lax, not Strict: the link arrives as a top-level GET navigation out of WhatsApp's
    // in-app browser. Strict drops the cookie on that navigation, so every shared link would
    // render logged-out and the product would look broken on its only distribution channel.
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** Reads the cookie off a web-standard Request, which is what a Next.js route handler gets. */
export function sessionFromRequest(request: Request, now = Date.now()): Session | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const cookie = part.trim();
    if (!cookie.startsWith(`${SESSION_COOKIE}=`)) continue;
    return readSession(cookie.slice(SESSION_COOKIE.length + 1), now);
  }
  return null;
}
