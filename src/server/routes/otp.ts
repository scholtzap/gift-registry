import { createElement } from "react";
import { createRequire } from "node:module";
import { env } from "@/lib/env";
import type { Db } from "@/server/db/client";
import { trustedClientAddress } from "@/server/auth/client-address";
import { isSameOrigin } from "@/server/auth/same-origin";
import { classifyIdentifier, hashIdentifier, type Identifier } from "@/server/auth/email-hash";
import { keyedHash } from "@/server/auth/phone-hash";
import { gateThrottle } from "@/server/auth/throttle-store";
import { checkTurnstile, turnstileField } from "@/server/auth/turnstile";
import { issueSession, sessionCookie } from "@/server/auth/session";
import { issueOtpCode, verifyOtpCode } from "@/server/ledger/otp";
import { deliverLoginCode } from "@/server/otp/deliver";
import { reserveRecipientSend } from "@/server/otp/send-cap";
import { FindCirclesScreen, VerifyCodeScreen } from "@/components/screens/find";
import { CONTENT_SECURITY_POLICY, page } from "@/server/routes/shell";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as typeof import("react-dom/server");

/**
 * Email return path (docs/plans/otp-return-path.md).
 * One field accepts an email or a phone. A code is sent when that identifier
 * matches someone who owns an active circle and has an email. The circle's
 * discoverable flag does not matter: this is the owner's door, and friends
 * open `/c/<slug>` instead. A miss and a circle with no email answer with
 * the same status, body and latency floor. The page never echoes the address
 * on record.
 */

const NO_STORE = "private, no-store, max-age=0, must-revalidate";
const BASE = process.env.PINATA_BASE_PATH ?? "";
export const OTP_RESPONSE_FLOOR_MS = 1500;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findPage(notice?: string): Response {
  const body = page("Open my circle", renderToStaticMarkup(
    createElement(FindCirclesScreen, { basePath: BASE, notice }),
  ));
  return new Response(body, { status: 422, headers: headers({ "Content-Type": "text/html; charset=utf-8" }) });
}

function verifyPage(identifier: string, notice?: string): Response {
  const body = page("Enter the code", renderToStaticMarkup(
    createElement(VerifyCodeScreen, { basePath: BASE, identifier, notice }),
  ));
  return new Response(body, { status: 422, headers: headers({ "Content-Type": "text/html; charset=utf-8" }) });
}

const UNIFORM_NOTICE =
  "If that email or phone is on a circle, a code is on its way. It expires in ten minutes.";
const WRONG_CODE_NOTICE =
  "That code didn't work. Check what you entered and try again, or ask for a new code.";

export interface LoginCodeSender {
  (input: { to: string; code: string }): Promise<boolean>;
}

async function defaultSender(input: { to: string; code: string }): Promise<boolean> {
  return deliverLoginCode({
    to: input.to,
    code: input.code,
    // Tests must not hit Resend even when a key is present in the environment.
    demo: env.DEMO_MODE === "on" || process.env.VITEST === "true",
    apiKey: env.RESEND_API_KEY,
    from: env.OTP_FROM_EMAIL,
  });
}

/** The circle a fresh session opens: most recent owned circle, else most recent membership. */
async function homeCircle(db: Db, userId: string): Promise<{ circleId: string; role: "owner" | "friend" } | null> {
  const owned = await db.prisma.circle.findFirst({
    where: { ownerUserId: userId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (owned) return { circleId: owned.id, role: "owner" };
  const member = await db.prisma.membership.findFirst({
    where: { userId, status: "active", circle: { status: "active" } },
    orderBy: { joinedAt: "desc" },
    select: { circleId: true, role: true },
  });
  if (!member || (member.role !== "owner" && member.role !== "friend")) return null;
  return { circleId: member.circleId, role: member.role };
}

async function deliverableOwner(
  db: Db, identifier: Identifier, pepper: string,
): Promise<{ userId: string; email: string; emailHash: string } | null> {
  const user = identifier.kind === "email"
    ? await db.prisma.user.findUnique({
      where: { emailHash: hashIdentifier(identifier, pepper) },
      select: { id: true, email: true, emailHash: true },
    })
    : await db.prisma.user.findUnique({
      where: { phoneE164: identifier.normalized },
      select: { id: true, email: true, emailHash: true },
    });
  if (!user?.email || !user.emailHash) return null;
  const owned = await db.prisma.circle.findFirst({
    where: { ownerUserId: user.id, status: "active" },
    select: { id: true },
  });
  if (!owned) return null;
  return { userId: user.id, email: user.email, emailHash: user.emailHash };
}

export async function handleFindPost(
  db: Db, request: Request, deliver: LoginCodeSender = defaultSender,
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return findPage("That submission could not be verified as coming from this page. Open it again and try.");
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return verifyPage("", UNIFORM_NOTICE); }
  const raw = String(form.get("identifier") ?? form.get("phone") ?? "");
  if (!(await checkTurnstile(request, turnstileField(form)))) {
    return verifyPage(raw, UNIFORM_NOTICE);
  }

  const identifier = classifyIdentifier(raw);
  const pepper = env.PHONE_HASH_PEPPER;
  const requester = identifier
    ? hashIdentifier(identifier, pepper)
    : keyedHash(`invalid:${raw.slice(0, 64)}`, pepper);
  const gate = await gateThrottle(db, [
    { key: `otp-req:${requester}`, max: 3 },
    { key: `otp-addr:${trustedClientAddress(request)}`, max: 60 },
  ]);
  if (!gate.allowed) {
    return new Response(
      page("Open my circle", renderToStaticMarkup(
        createElement(FindCirclesScreen, { basePath: BASE, notice: "Too many tries. Wait a minute and try again." }),
      )),
      { status: 429, headers: headers({ "Content-Type": "text/html; charset=utf-8", "Retry-After": String(gate.retryAfter) }) },
    );
  }

  const started = Date.now();
  const finish = async (): Promise<Response> => {
    const wait = OTP_RESPONSE_FLOOR_MS - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    return verifyPage(raw, UNIFORM_NOTICE);
  };
  if (!identifier) return finish();

  const target = await deliverableOwner(db, identifier, pepper);
  if (!target) return finish();

  // Over the hourly cap: same page, no send. The cap is on the address we
  // would write to, so phone lookups and email lookups share it.
  if (!(await reserveRecipientSend(db, target.emailHash))) return finish();

  const issued = await issueOtpCode(db, target.userId, requester, pepper);
  if (!issued) return finish();

  // Do not await the network. A slow provider must not make a hit slower than a miss.
  void deliver({ to: target.email, code: issued.code }).then((sent) => {
    if (!sent) console.error("otp_send_failed", { identifierHash: requester });
  }).catch(() => {
    console.error("otp_send_failed", { identifierHash: requester });
  });
  return finish();
}

export async function handleFindGet(db: Db): Promise<Response> {
  void db;
  const body = page("Open my circle", renderToStaticMarkup(
    createElement(FindCirclesScreen, { basePath: BASE }),
  ));
  return new Response(body, { status: 200, headers: headers({ "Content-Type": "text/html; charset=utf-8" }) });
}

export async function handleVerifyPost(db: Db, request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return verifyPage("", WRONG_CODE_NOTICE);
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return verifyPage("", WRONG_CODE_NOTICE); }
  const raw = String(form.get("identifier") ?? form.get("phone") ?? "");
  if (!(await checkTurnstile(request, turnstileField(form)))) {
    return verifyPage(raw, WRONG_CODE_NOTICE);
  }

  const identifier = classifyIdentifier(raw);
  const code = String(form.get("code") ?? "").trim();
  const verifier = identifier
    ? hashIdentifier(identifier, env.PHONE_HASH_PEPPER)
    : keyedHash(`invalid:${raw.slice(0, 64)}`, env.PHONE_HASH_PEPPER);
  const gate = await gateThrottle(db, [
    { key: `otp-verify:${verifier}`, max: 10 },
    { key: `otp-verify-addr:${trustedClientAddress(request)}`, max: 120 },
  ]);
  if (!gate.allowed) {
    return new Response(
      page("Enter the code", renderToStaticMarkup(
        createElement(VerifyCodeScreen, { basePath: BASE, identifier: raw, notice: "Too many tries. Wait a minute and try again." }),
      )),
      { status: 429, headers: headers({ "Content-Type": "text/html; charset=utf-8", "Retry-After": String(gate.retryAfter) }) },
    );
  }
  if (!identifier || !/^\d{6}$/.test(code)) return verifyPage(raw, WRONG_CODE_NOTICE);

  const verified = await verifyOtpCode(db, hashIdentifier(identifier, env.PHONE_HASH_PEPPER), code, env.PHONE_HASH_PEPPER);
  if (!verified) return verifyPage(raw, WRONG_CODE_NOTICE);

  const home = await homeCircle(db, verified.userId);
  if (!home) return verifyPage(raw, WRONG_CODE_NOTICE);

  const token = issueSession({ userId: verified.userId, circleId: home.circleId, role: home.role });
  const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return new Response(null, {
    status: 303,
    headers: headers({ Location: `${BASE}/app`, "Set-Cookie": sessionCookie(token, expiry) }),
  });
}
