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

/** JSON object keys whose *string* values should be faked outright (non-name categories). */
const OTHER_SENSITIVE_KEY_REGEX = /email|phone|address|birth|dob|ssn|id$|studentid|emplid/i;

/**
 * Keys that unambiguously carry a real person's name, regardless of what
 * the value looks like - faked outright.
 */
const PERSON_NAME_KEY_REGEX =
  /(?:fullname|preferredname|legalname|studentname|displayname|firstname|lastname)$/i;

/**
 * Keys that look name-ish but are actually UI/navigation labels (Workday
 * task/hub titles, widget labels, etc.), not person names. Never faked as
 * names, even though they match /name/ or /id$/ superficially.
 */
const NON_PERSON_LABEL_KEY_REGEX = /taskname|hubname|widget|label|title/i;

/** Keys that must never be faked even if they match the other regexes above. */
const DENY_KEY_REGEX = /course|section|term|grade|credit/i;

/** True if `value` looks like a person's name: 2-4 capitalized words. */
function looksLikePersonName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) => /^[A-Z][A-Za-z'.-]*$/.test(w));
}

/** True if `value` case-insensitively matches one of the user-supplied --pii entries. */
function matchesPiiList(value: string, piiList: string[]): boolean {
  const v = value.trim().toLowerCase();
  return piiList.some((p) => p.trim().toLowerCase() === v);
}

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

/**
 * Decide whether a JSON key's string value should be faked outright.
 *
 * "name"-shaped keys need care: `taskName`, `hubName`, `widget`, `label`,
 * and `title` hold Workday UI/navigation copy (e.g. a menu label), not
 * personal data, and must never be faked. Real person-name keys (fullName,
 * preferredName, legalName, studentName, displayName, firstName, lastName)
 * always get faked. A plain `name` key is ambiguous, so it's only faked
 * when the value both looks like a person name (2-4 capitalized words) and
 * matches an entry in the user-supplied --pii list - when unsure, this
 * leaves generic labels alone.
 */
function shouldFakeKey(key: string, value: string, piiList: string[]): boolean {
  if (DENY_KEY_REGEX.test(key)) return false;
  if (NON_PERSON_LABEL_KEY_REGEX.test(key)) return false;
  if (PERSON_NAME_KEY_REGEX.test(key)) return true;
  if (/^name$/i.test(key.trim())) {
    return looksLikePersonName(value) && matchesPiiList(value, piiList);
  }
  return OTHER_SENSITIVE_KEY_REGEX.test(key);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = any;

function redactJsonValue(value: JsonValue, key: string | null, piiList: string[]): JsonValue {
  if (typeof value === "string") {
    if (key && shouldFakeKey(key, value, piiList) && !looksLikeCourseCode(value)) {
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
