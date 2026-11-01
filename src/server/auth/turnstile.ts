/**
 * Human-proof bot gate for the three session-issuing creates (F12).
 *
 * Cloudflare Turnstile: the browser widget proves humanity, this module
 * verifies the token server-side. Deliberately a seam, not a silent no-op:
 * while `TURNSTILE_SECRET` is unset (local dev, demo, tests) verification is
 * skipped so the product runs; before external users arrive, set the secret
 * AND render the widget (`<TurnstileWidget />` in the gate/hub/lookup forms)
 * so every create carries a token. A missing secret with a present widget, or
 * vice versa, is a deploy misconfiguration the boot log warns about — never
 * a silent bypass.
 */

export interface TurnstileResult {
  success: boolean;
  'error-codes'?: string[];
}

export async function verifyTurnstileToken(
  token: string,
  secret: string,
  remoteIp: string | undefined,
  http: typeof fetch = fetch,
): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);
  let res: Response;
  try {
    res = await http('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  try {
    const parsed = (await res.json()) as TurnstileResult;
    return parsed.success === true;
  } catch {
    return false;
  }
}

/**
 * Returns true when the request may proceed. No secret configured means the
 * seam is open (dev/demo/test); a configured secret requires a valid token.
 * Network or verification failures deny: fail closed, never fail open.
 */
export function turnstileField(form: FormData): string | null {
  const value = form.get('cf-turnstile-response');
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Returns true when the request may proceed. No secret configured means the
 * seam is open (dev/demo/test); a configured secret requires a valid token.
 * Network or verification failures deny: fail closed, never fail open.
 */
export async function checkTurnstile(
  request: Request,
  token: string | null | undefined,
  http: typeof fetch = fetch,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;
  if (!token) return false;
  const forwarded = request.headers.get('x-forwarded-for');
  const remoteIp = forwarded?.split(',')[0]?.trim() || undefined;
  return verifyTurnstileToken(token, secret, remoteIp, http);
}

export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY ?? null;
}
