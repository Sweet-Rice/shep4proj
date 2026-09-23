import { ALLOWED_ENDPOINTS } from "./allowed-endpoints.js";
import { assertAllowed } from "./assert-allowed.js";
import type { AllowedEndpoint, GuardedRequest, GuardedResponse, PageLike } from "./types.js";

interface EvaluateArg {
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Runs `assertAllowed` against the request, then performs it with
 * `page.evaluate(() => fetch(...))` so the call carries the same cookies
 * and security headers as the real Workday frontend (`credentials:
 * "include"`). Nothing is evaluated in the page if the request is rejected.
 *
 * `page` only needs to satisfy `PageLike`, so this is testable without a
 * real `playwright-core` browser.
 */
export async function guardedFetch(
  page: PageLike,
  req: GuardedRequest,
  list: readonly AllowedEndpoint[] = ALLOWED_ENDPOINTS,
): Promise<GuardedResponse> {
  assertAllowed(req.method, req.url, list);

  return page.evaluate<EvaluateArg, GuardedResponse>(async (arg) => {
    const response = await fetch(arg.url, {
      method: arg.method,
      headers: arg.headers,
      body: arg.body === undefined ? undefined : JSON.stringify(arg.body),
      credentials: "include",
    });

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    return { status: response.status, json };
  }, req);
}
