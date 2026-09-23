import { FAKE_EMAIL_DOMAIN, FAKE_PHONE_PREFIX, FAKE_ID_PREFIX } from "./fakes.ts";

export interface LeftoverHit {
  type: "pii" | "email" | "phone" | "jwt" | "hex-token" | "base64-token";
  match: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_REGEX = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
const JWT_REGEX = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const HEX_TOKEN_REGEX = /\b[0-9a-f]{32,}\b/gi;
// Deliberately excludes "/" from the character class: URL paths ("com/lsu/d/api/...")
// otherwise match a naive base64 pattern. Real base64 blobs still get caught via
// their "+"/"=" padding or (for hex-only secrets) HEX_TOKEN_REGEX above.
const BASE64_TOKEN_REGEX =
  /\b(?=[A-Za-z0-9+]*[a-z])(?=[A-Za-z0-9+]*[A-Z0-9])[A-Za-z0-9+]{40,}={0,2}\b/g;

/** Fake artifacts our own redactor produces - never flagged as leftovers. */
function isKnownFake(match: string): boolean {
  if (match.toLowerCase().endsWith(`@${FAKE_EMAIL_DOMAIN}`)) return true;
  if (match.includes(FAKE_PHONE_PREFIX)) return true;
  if (match.startsWith(FAKE_ID_PREFIX)) return true;
  return false;
}

/**
 * Scan already-redacted text for anything that still looks like PII or a
 * live credential: any string from `piiList`, an email, a US phone number,
 * a JWT, or a long hex/base64 token. Used as a defense-in-depth check after
 * redactHar, since redactHar only faces known field shapes.
 */
export function scanForLeftovers(text: string, piiList: string[] = []): LeftoverHit[] {
  const hits: LeftoverHit[] = [];
  if (!text) return hits;

  for (const pii of piiList) {
    if (!pii.trim()) continue;
    const re = new RegExp(escapeRegExp(pii), "gi");
    const matches = text.match(re);
    if (matches) {
      for (const m of matches) hits.push({ type: "pii", match: m });
    }
  }

  const patterns: Array<[LeftoverHit["type"], RegExp]> = [
    ["email", EMAIL_REGEX],
    ["phone", PHONE_REGEX],
    ["jwt", JWT_REGEX],
    ["hex-token", HEX_TOKEN_REGEX],
    ["base64-token", BASE64_TOKEN_REGEX],
  ];
  for (const [type, re] of patterns) {
    const matches = text.match(re);
    if (!matches) continue;
    for (const m of matches) {
      if (isKnownFake(m)) continue;
      hits.push({ type, match: m });
    }
  }

  return hits;
}
