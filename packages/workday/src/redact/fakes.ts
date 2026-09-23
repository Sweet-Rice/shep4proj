/**
 * Deterministic "fake" value generators used by the redactor.
 *
 * Every function here is a pure function of its input: the same real value
 * always produces the same fake value, but different real values are very
 * unlikely to collide. Nothing here reads any real secret material back out
 * of the hash - it is one-way and only used to pick a stable index/digit
 * sequence.
 */

/** Domain used for every faked email address. Recognized as safe by scanForLeftovers. */
export const FAKE_EMAIL_DOMAIN = "example.edu";

/** Exchange reserved for fictional phone numbers (555-0100 to 555-0199). */
export const FAKE_PHONE_PREFIX = "555-01";

/** Prefix used for faked student/record identifiers. */
export const FAKE_ID_PREFIX = "STUDENT-";

const ORDINAL_WORDS = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
];

/** FNV-1a 32-bit hash. Deterministic, no external deps. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  const s = input.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A small seeded PRNG (mulberry32), seeded from a hash of the input string. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stableIndex(input: string, mod: number): number {
  return hashString(input) % mod;
}

/** Deterministic digit string of the given length derived from `seed`. */
export function fakeDigitsOfLength(seed: string, length: number): string {
  const rand = seededRandom(hashString(seed));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += Math.floor(rand() * 10).toString();
  }
  return out;
}

/**
 * Replace every digit in `matched` with a deterministic digit, keeping every
 * non-digit character (dashes, dots, slashes, parens, spaces) exactly where
 * it was. Works for phone numbers, SSNs, dates of birth, and bare digit
 * runs alike, and always preserves length/format.
 */
export function fakeDigitsPreservingFormat(matched: string): string {
  const digitCount = (matched.match(/\d/g) ?? []).length;
  const digits = fakeDigitsOfLength(matched, digitCount);
  let i = 0;
  return matched.replace(/\d/g, () => digits[i++] as string);
}

/** Deterministic fake "Student <Ordinal>" name for a real name string. */
export function fakeName(real: string): string {
  const idx = stableIndex(real, ORDINAL_WORDS.length);
  return `Student ${ORDINAL_WORDS[idx]}`;
}

/** Deterministic fake STUDENT-NNNN identifier for a real id-like string. */
export function fakeStudentId(real: string): string {
  const idx = stableIndex(real, 9999) + 1;
  return `${FAKE_ID_PREFIX}${String(idx).padStart(4, "0")}`;
}

/** Deterministic fake email at a domain reserved for fixtures. */
export function fakeEmail(real: string): string {
  const idx = stableIndex(real, 100000);
  return `student.${idx}@${FAKE_EMAIL_DOMAIN}`;
}

/** Deterministic fake US phone number in the fictional 555-01xx exchange. */
export function fakePhone(real: string): string {
  const areaCode = fakeDigitsOfLength(real + "area", 3);
  const line = fakeDigitsOfLength(real, 2);
  return `${areaCode}-555-01${line}`;
}
