import {
  assertAllowed,
  type AllowedEndpoint,
  type HttpMethod,
} from "@jevschedule/workday/allowlist";
import type { PageLike } from "@jevschedule/workday/browser";

/**
 * Header names `packages/workday/ENDPOINTS.md` lists as required for the generic-hub reads.
 * Only these values are copied out of an observed request; cookies stay in the browser.
 */
export const HARVESTED_HEADER_NAMES = [
  "session-secure-token",
  "x-workday-client",
  "accept",
  "content-type",
  "referer",
] as const;

/** One outgoing Workday UI request that passed the allowlist and carried a session token. */
export interface HarvestedRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** A signed-in Workday UI page to open, and the allowlist entry its data requests must match. */
export interface HarvestTarget {
  readonly uiUrl: string;
  readonly endpoint: AllowedEndpoint;
}

/**
 * Opens `target.uiUrl` in the signed-in page and resolves with the allowlisted data requests the
 * Workday UI itself sent. Rejects with `WorkdayHarvestTimeoutError` when none arrive in time.
 */
export type HarvestWorkdayRequests = (
  page: PageLike,
  target: HarvestTarget,
) => Promise<HarvestedRequest[]>;

export class WorkdayHarvestTimeoutError extends Error {
  constructor() {
    super("Workday did not send the expected data requests in time");
    this.name = "WorkdayHarvestTimeoutError";
  }
}

export interface RequestHarvesterOptions {
  /** How long to wait for the first matching request. */
  timeoutMs?: number;
  /** Quiet period after the latest match before the candidates are returned. */
  settleMs?: number;
  /** Stop observing once this many distinct request URLs have matched. */
  maxCandidates?: number;
}

/** The slice of Playwright's `Request` the harvester reads. */
interface ObservedRequest {
  url(): string;
  method(): string;
  allHeaders(): Promise<Record<string, string>>;
}

/** The slice of Playwright's `Page` the harvester needs beyond the browser package's `PageLike`. */
interface RequestObservingPage {
  goto(url: string): Promise<unknown>;
  on(event: "request", listener: (request: ObservedRequest) => void): unknown;
  off(event: "request", listener: (request: ObservedRequest) => void): unknown;
}

function pickHeaders(all: Record<string, string>): Record<string, string> | null {
  if (!all["session-secure-token"]) return null;
  const picked: Record<string, string> = {};
  for (const name of HARVESTED_HEADER_NAMES) {
    const value = all[name];
    if (value) picked[name] = value;
  }
  return picked;
}

/**
 * Creates the real request harvester. It only observes outgoing requests: response bodies are
 * never read here, and the harvested header values are returned to the caller in memory only.
 */
export function createRequestHarvester(
  options: RequestHarvesterOptions = {},
): HarvestWorkdayRequests {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const settleMs = options.settleMs ?? 3_000;
  const maxCandidates = options.maxCandidates ?? 6;

  return (browserPage, target) => {
    // The browser package types only the events it uses; at runtime this is a Playwright Page.
    const page = browserPage as unknown as RequestObservingPage;
    return new Promise<HarvestedRequest[]>((resolve, reject) => {
      const candidates: HarvestedRequest[] = [];
      const seen = new Set<string>();
      let settled = false;
      let settleTimer: ReturnType<typeof setTimeout> | undefined;

      function finish(error?: Error): void {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        clearTimeout(settleTimer);
        page.off("request", onRequest);
        if (error) reject(error);
        else resolve(candidates);
      }

      function onRequest(request: ObservedRequest): void {
        let url: string;
        try {
          url = request.url();
          assertAllowed(request.method() as HttpMethod, url, [target.endpoint]);
        } catch {
          return;
        }
        if (seen.has(url)) return;
        seen.add(url);
        void request.allHeaders().then(
          (all) => {
            const headers = pickHeaders(all);
            if (settled || !headers) return;
            candidates.push({ url, headers });
            if (candidates.length >= maxCandidates) {
              finish();
              return;
            }
            clearTimeout(settleTimer);
            settleTimer = setTimeout(() => finish(), settleMs);
          },
          () => undefined,
        );
      }

      const timeoutTimer = setTimeout(() => {
        if (candidates.length > 0) finish();
        else finish(new WorkdayHarvestTimeoutError());
      }, timeoutMs);
      page.on("request", onRequest);
      page.goto(target.uiUrl).catch(() => {
        finish(new Error("Workday page could not be opened"));
      });
    });
  };
}
