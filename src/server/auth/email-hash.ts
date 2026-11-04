import { hashPhone, keyedHash, normalizeE164 } from "@/server/auth/phone-hash";

/**
 * Lookup form of an email. Trim, Unicode NFC, lowercase. Plus-tags stay, so
 * user+circle@example.test and user@example.test are different keys. Dots are
 * not folded: that is provider-specific and would merge inboxes the person
 * kept apart.
 */
export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().normalize("NFC").toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 254) return null;
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (local.length < 1 || local.length > 64) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) return null;
  return trimmed;
}

/** Purpose-separated from phone hashes: the message is `email:` + normalised form. */
export function hashEmail(email: string, pepper: string): string {
  const normalized = normalizeEmail(email);
  if (normalized === null) throw new Error("email is not usable");
  return keyedHash(`email:${normalized}`, pepper);
}

export type Identifier =
  | { kind: "email"; normalized: string }
  | { kind: "phone"; normalized: string };

/** One field accepts either. An @ means email; anything else is tried as E.164. */
export function classifyIdentifier(raw: string): Identifier | null {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    const email = normalizeEmail(trimmed);
    return email === null ? null : { kind: "email", normalized: email };
  }
  const phone = normalizeE164(trimmed);
  return phone === null ? null : { kind: "phone", normalized: phone };
}

export function hashIdentifier(identifier: Identifier, pepper: string): string {
  return identifier.kind === "email"
    ? hashEmail(identifier.normalized, pepper)
    : hashPhone(identifier.normalized, pepper);
}
