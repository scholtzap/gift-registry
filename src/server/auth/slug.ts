import { randomBytes } from "node:crypto";

/**
 * The share slug is a bearer capability: /c/<slug> resolves on the slug alone.
 * Slugs are therefore CSPRNG output, never words or sequences. 18 random bytes
 * encode to 24 base64url characters (144 bits), above the >=16 character floor
 * the threat model sets (RN-D Gate 6).
 */
export function generateShareSlug(): string {
  return randomBytes(18).toString("base64url");
}
