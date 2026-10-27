/**
 * The one place a request's client address is derived (RN-D Gate 3).
 *
 * Behind the production proxy, the socket peer is always the proxy itself, so
 * keying a throttle on the socket would collapse every real user into one
 * bucket. But a client-supplied forwarding header is a claim, not evidence:
 * trusting it unconditionally lets one caller mint unlimited throttle keys.
 * The header is therefore honoured only when TRUSTED_PROXY=on says a trusted
 * proxy (Caddy, which overwrites X-Forwarded-For) is in front. Default off:
 * the local demo has no proxy, so it is unthrottled-by-flag rather than broken.
 *
 * The socket address has no portable Request accessor, so callers may pass
 * the platform-provided peer address as the fallback.
 */
export function trustedClientAddress(
  request: Request,
  socketAddress?: string,
  trustedProxy: boolean = process.env.TRUSTED_PROXY === "on",
): string {
  if (trustedProxy) {
    const forwarded = request.headers.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
  }
  return socketAddress ?? "unknown";
}
