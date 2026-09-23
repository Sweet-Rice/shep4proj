import { redactBodyText } from "./body.ts";
import type { Har } from "./har-types.ts";
import { headerNames, redactUrl } from "./headers.ts";

export interface RedactOptions {
  /** Suffix-matched allowlist of hosts to keep. Everything else is dropped. */
  hosts?: string[];
  /** Real PII strings (names, ids, emails, ...) supplied by the human. */
  pii?: string[];
}

export interface RedactedRequest {
  method: string;
  url: string;
  status: number;
  requestHeaderNames: string[];
  responseHeaderNames: string[];
  requestBody: string | null;
  responseBody: string | null;
  mimeType: string | null;
}

export const DEFAULT_HOSTS = ["myworkday.com", "workday.com"];

function hostMatches(hostname: string, suffix: string): boolean {
  const h = hostname.toLowerCase();
  const s = suffix.toLowerCase();
  return h === s || h.endsWith(`.${s}`);
}

/**
 * Reduce a HAR capture to only the fields safe to write to a fixture:
 * no cookies, no auth/session/token headers or query params, and every
 * piece of PII in JSON/text bodies replaced by a stable fake.
 *
 * Never touches the network - operates purely on the in-memory HAR object.
 */
export function redactHar(har: Har, opts: RedactOptions = {}): RedactedRequest[] {
  const hosts = opts.hosts && opts.hosts.length > 0 ? opts.hosts : DEFAULT_HOSTS;
  const piiList = opts.pii ?? [];
  const entries = har.log?.entries ?? [];

  const results: RedactedRequest[] = [];
  for (const entry of entries) {
    const req = entry.request;
    const res = entry.response;
    if (!req?.url) continue;

    let hostname: string;
    try {
      hostname = new URL(req.url).hostname;
    } catch {
      continue;
    }
    if (!hosts.some((h) => hostMatches(hostname, h))) continue;

    results.push({
      method: req.method,
      url: redactUrl(req.url),
      status: res?.status ?? 0,
      requestHeaderNames: headerNames(req.headers),
      responseHeaderNames: headerNames(res?.headers),
      requestBody: redactBodyText(req.postData?.text, piiList),
      responseBody: redactBodyText(res?.content?.text, piiList),
      mimeType: res?.content?.mimeType ?? req.postData?.mimeType ?? null,
    });
  }
  return results;
}
