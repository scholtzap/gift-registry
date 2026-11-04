import { env } from "@/lib/env";

/**
 * Login-CSRF guard for every endpoint that *issues* a session.
 *
 * `SameSite=Lax` protects an existing cookie on a cross-site POST, but these
 * handlers mint a cookie: a plain HTML form POST is a CORS "simple request"
 * and browsers accept `Set-Cookie` from the response, so an attacker who
 * knows an allow-listed number could log their victim into the attacker's
 * circle from the victim's own browser. Origin (or Referer) has to name this
 * app's own origin. Modern browsers send `Origin` on every same-origin POST,
 * so a real form submit always passes; a non-browser caller with no header
 * at all is refused rather than trusted.
 */
export function isSameOrigin(request: Request): boolean {
  const raw = request.headers.get("origin");
  // A no-referrer document makes Chromium send the opaque origin token "null".
  const candidate = raw && raw !== "null" ? raw : request.headers.get("referer");
  if (!candidate || candidate === "null") return false;
  try {
    return new URL(candidate).origin === new URL(env.CIRCLE_BASE_URL).origin;
  } catch {
    return false;
  }
}
