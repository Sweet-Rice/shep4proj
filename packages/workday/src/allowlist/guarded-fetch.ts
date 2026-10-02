import { ALLOWED_ENDPOINTS } from "./allowed-endpoints.js";
import { assertAllowed } from "./assert-allowed.js";
import type {
  AllowedEndpoint,
  FetchImplementation,
  GuardedRequest,
  GuardedResponse,
} from "./types.js";

/** Authorizes before issuing a request through the supplied session-aware fetch. */
export async function guardedFetch(
  fetch: FetchImplementation,
  req: GuardedRequest,
  list: readonly AllowedEndpoint[] = ALLOWED_ENDPOINTS,
): Promise<GuardedResponse> {
  assertAllowed(req.method, req.url, list);

  const response = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    credentials: "include",
  });

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}
