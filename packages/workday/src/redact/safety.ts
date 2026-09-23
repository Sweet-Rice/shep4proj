import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";

/**
 * True if `outDir` resolves to a path with a `raw/` segment anywhere in it.
 * Raw HAR captures must never be written to by the redaction tooling, so
 * any output path under a `raw/` directory is refused.
 */
export function isRawDir(outDir: string): boolean {
  const parts = resolve(outDir).split(sep);
  return parts.some((p) => p.toLowerCase() === "raw");
}

/** Maximum length of a slug produced by `shortPathSlug`, filesystem-name safe. */
const MAX_SLUG_LEN = 80;
/** "-" + 8 hex chars of a sha256, appended whenever anything was dropped/truncated. */
const SUFFIX_LEN = 9;

/**
 * True if `seg` looks like an opaque ID or token rather than a normal path
 * word, and should be dropped from the slug rather than kept verbatim:
 *
 *  - longer than 24 characters (way past any real path word)
 *  - a hex string of 16+ characters (hashes, object ids)
 *  - all-digits (numeric database/record ids)
 *  - "mostly digits" (>= 70% digit characters, length >= 8) - e.g. Workday
 *    instance-scoped ids like "17213$8"
 *  - base64/base64url-ish: a single unbroken run (no separators) of mixed
 *    upper+lower+digit characters, 12+ characters long - the shape of an
 *    embedded auth/attachment token, not a dictionary-ish path word
 */
export function isIdOrTokenSegment(seg: string): boolean {
  if (seg.length > 24) return true;
  if (/^[0-9a-f]{16,}$/i.test(seg)) return true;
  if (/^\d+$/.test(seg)) return true;

  const digitCount = (seg.match(/\d/g) ?? []).length;
  if (seg.length >= 8 && digitCount / seg.length >= 0.7) return true;

  const isUnbrokenRun = !/[-_.\s]/.test(seg);
  if (
    seg.length >= 12 &&
    isUnbrokenRun &&
    /[a-z]/.test(seg) &&
    /[A-Z]/.test(seg) &&
    /\d/.test(seg)
  ) {
    return true;
  }

  return false;
}

/**
 * Builds the short, ID/token-free filename slug for a request's URL path.
 *
 * Path segments that look like ids or tokens (see `isIdOrTokenSegment`) are
 * replaced with a placeholder rather than kept verbatim, so long or
 * sensitive values (auth tokens, attachment tokens, database ids) never
 * end up embedded in a filename. The result is capped at `MAX_SLUG_LEN`
 * characters; whenever anything was dropped or the slug had to be
 * truncated to fit, a short content-derived suffix is appended so that
 * distinct URLs still produce distinct, unique filenames.
 */
export function shortPathSlug(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }

  let droppedAnySegment = false;
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      if (isIdOrTokenSegment(seg)) {
        droppedAnySegment = true;
        return "id";
      }
      return seg;
    });

  const slug = segments
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) return "root";

  const needsSuffix = droppedAnySegment || slug.length > MAX_SLUG_LEN;
  if (!needsSuffix) return slug;

  const hash = createHash("sha256").update(pathname).digest("hex").slice(0, 8);
  const budget = MAX_SLUG_LEN - SUFFIX_LEN;
  const truncated = slug.slice(0, budget).replace(/-+$/, "");
  return `${truncated}-${hash}`;
}
