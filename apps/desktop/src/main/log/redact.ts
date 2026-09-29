/** What every redacted value is replaced with. */
export const REDACTED = "[REDACTED]";

/**
 * Key names whose values are secrets. Matched as a substring of the key, so `sessionSecureToken`,
 * `PLAY_SESSION` and `x-csrf-token` are all caught. Over-matching (e.g. `courseKey`) only costs
 * a redacted log value, which is the safe way to be wrong.
 */
const SENSITIVE_KEY =
  "[\\w.-]*(?:token|session|secret|auth|csrf|cookie|passw|credential|jwt|sid|key)[\\w.-]*";

interface Rule {
  pattern: RegExp;
  replace: string | ((match: string) => string);
}

/** A path segment that looks like a token rather than a name: long, mixed case, with digits. */
const TOKEN_SEGMENT = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[\w+-]{20,}={0,2}$/;

/**
 * Base64's alphabet includes `/`, which overlaps with Unix file paths. Preserve only runs that
 * begin like an absolute path and have ordinary path segments; slash-bearing credentials are
 * redacted even when none of their individual segments looks token-shaped.
 */
function redactLongRun(run: string): string {
  const normalized = run.replaceAll("\\", "/");
  const absolute = normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
  if (!absolute) return REDACTED;

  const segments = normalized
    .replace(/^[A-Za-z]:/, "")
    .split("/")
    .filter(Boolean);
  const isFilePath =
    segments.length >= 2 &&
    segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment)) &&
    !segments.some((segment) => TOKEN_SEGMENT.test(segment));

  return isFilePath ? run : REDACTED;
}

/**
 * Applied in order. Context rules come first because they catch short secrets (`sid=abc123`)
 * that no shape-based rule could tell apart from ordinary text; the shape rules after them
 * catch token-looking strings that turn up without a telltale name.
 */
const RULES: readonly Rule[] = [
  // Raw header lines (`Cookie: a=1; b=2`): the value can contain spaces and `;`, so take
  // everything to the end of the line. Quoted values are left to the key/value rule below, so
  // an inspected object like `{ cookie: 'a=1', count: 3 }` keeps its other fields.
  {
    pattern: /\b((?:set-)?cookie|(?:proxy-)?authorization)([ \t]*:[ \t]*)(?![ \t"'])[^\r\n]+/gi,
    replace: `$1$2${REDACTED}`,
  },
  // Auth schemes that appear without a header name.
  { pattern: /\b(Bearer|Basic)\s+[\w.~+/-]+=*/gi, replace: `$1 ${REDACTED}` },
  // key=value, key: value, "key": "value", 'key': 'value', and 'key' => 'value' (how
  // util.inspect prints Maps and URLSearchParams) where the key is sensitive.
  {
    pattern: new RegExp(
      `((["']?)${SENSITIVE_KEY}\\2\\s*(?:=>|[:=])\\s*)(?!\\[REDACTED\\])` +
        `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|[^\\s,;&}\\]"']+)`,
      "gi",
    ),
    replace: `$1${REDACTED}`,
  },
  // Query strings and fragments can carry SSO codes and tokens, so drop them from any URL.
  { pattern: /\b(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, replace: `$1?${REDACTED}` },
  // Shape-based fallbacks: JWTs, long hex strings, long base64/base64url runs.
  { pattern: /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, replace: REDACTED },
  { pattern: /\b[0-9a-f]{32,}\b/gi, replace: REDACTED },
  { pattern: /[A-Za-z0-9+/_.-]{40,}={0,2}/g, replace: redactLongRun },
];

/**
 * Removes cookie-, token- and session-shaped values from a log line (T-318). SECURITY.md
 * forbids Workday tokens, cookies or raw responses in logs, and the main process handles all
 * three during import, so `createLogger` runs every line through this before writing it.
 */
export function redactLogText(text: string): string {
  return RULES.reduce(
    (out, { pattern, replace }) =>
      typeof replace === "string" ? out.replace(pattern, replace) : out.replace(pattern, replace),
    text,
  );
}
