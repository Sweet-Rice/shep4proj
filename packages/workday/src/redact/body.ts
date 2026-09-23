import {
  fakeDigitsPreservingFormat,
  fakeEmail,
  fakeName,
  fakePhone,
  fakeStudentId,
} from "./fakes.ts";

/** Escapes a string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Course codes like "CSC 1350", "MATH4032", "ENGL 1001H" - never faked. */
export const COURSE_CODE_REGEX = /^[A-Za-z]{2,5}\s?-?\d{3,4}[A-Za-z]?$/;

export function looksLikeCourseCode(value: string): boolean {
  return COURSE_CODE_REGEX.test(value.trim());
}

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_REGEX = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
const DOB_REGEX = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})\b/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const LONG_DIGIT_RUN_REGEX = /\b\d{7,}\b/g;

/** Replace a real value with its stable fake, guessing the "shape" of it. */
function fakeForShape(real: string): string {
  const trimmed = real.trim();
  if (/^\d{4,}$/.test(trimmed)) return fakeStudentId(real);
  if (/@/.test(trimmed)) return fakeEmail(real);
  if (/^[\d\s().+-]{7,}$/.test(trimmed)) return fakeDigitsPreservingFormat(real);
  return fakeName(real);
}

/**
 * Apply the user-supplied PII list (case-insensitive, exact-match) and the
 * generic PII regexes (emails, phones, DOBs, SSNs, long digit runs) to a
 * chunk of free text. Used both for whole text bodies and for individual
 * JSON string leaves that aren't already handled by a key-based rule.
 */
export function redactFreeText(text: string, piiList: string[]): string {
  let out = text;
  for (const pii of piiList) {
    if (!pii.trim()) continue;
    const fake = fakeForShape(pii);
    const re = new RegExp(escapeRegExp(pii), "gi");
    out = out.replace(re, fake);
  }
  out = out.replace(SSN_REGEX, (m) => fakeDigitsPreservingFormat(m));
  out = out.replace(EMAIL_REGEX, (m) => fakeEmail(m));
  out = out.replace(PHONE_REGEX, (m) => fakeDigitsPreservingFormat(m));
  out = out.replace(DOB_REGEX, (m) => fakeDigitsPreservingFormat(m));
  out = out.replace(LONG_DIGIT_RUN_REGEX, (m) => fakeDigitsPreservingFormat(m));
  return out;
}

/** JSON object keys whose *string* values should be faked outright. */
const SENSITIVE_KEY_REGEX = /name|email|phone|address|birth|dob|ssn|id$|studentid|emplid/i;

/** Keys that must never be faked even if they match SENSITIVE_KEY_REGEX. */
const DENY_KEY_REGEX = /course|section|term|grade|credit/i;

function fakeForKey(key: string, value: string): string {
  const k = key.toLowerCase();
  if (/email/.test(k)) return fakeEmail(value);
  if (/phone/.test(k)) return fakePhone(value);
  if (/birth|dob/.test(k)) return fakeDigitsPreservingFormat(value);
  if (/ssn/.test(k)) return fakeDigitsPreservingFormat(value);
  if (/id$|studentid|emplid/.test(k)) return fakeStudentId(value);
  if (/name/.test(k)) return fakeName(value);
  if (/address/.test(k)) return fakeName(value);
  return fakeForShape(value);
}

function shouldFakeKey(key: string): boolean {
  if (DENY_KEY_REGEX.test(key)) return false;
  return SENSITIVE_KEY_REGEX.test(key);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = any;

function redactJsonValue(value: JsonValue, key: string | null, piiList: string[]): JsonValue {
  if (typeof value === "string") {
    if (key && shouldFakeKey(key) && !looksLikeCourseCode(value)) {
      return fakeForKey(key, value);
    }
    return redactFreeText(value, piiList);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item, key, piiList));
  }
  if (value && typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactJsonValue(v, k, piiList);
    }
    return out;
  }
  return value;
}

/**
 * Redact a request/response body. If the text parses as JSON, redaction is
 * key-aware (see SENSITIVE_KEY_REGEX / DENY_KEY_REGEX); otherwise the whole
 * text is treated as free text. Returns null for null/empty input.
 */
export function redactBodyText(text: string | null | undefined, piiList: string[]): string | null {
  if (text === null || text === undefined || text === "") return null;
  try {
    const parsed = JSON.parse(text);
    const redacted = redactJsonValue(parsed, null, piiList);
    return JSON.stringify(redacted);
  } catch {
    return redactFreeText(text, piiList);
  }
}
