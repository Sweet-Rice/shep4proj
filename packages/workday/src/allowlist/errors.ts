/**
 * Strips the query string from a URL so error messages never echo query
 * parameter values (which can carry IDs or other sensitive data).
 */
function withoutQuery(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/**
 * Thrown by `assertAllowed` when a request doesn't match the allowlist, or
 * matches a deny pattern. The message never includes query-string values.
 */
export class EndpointNotAllowedError extends Error {
  readonly method: string;
  readonly url: string;

  constructor(method: string, url: string, reason: string) {
    super(`Workday endpoint not allowed (${reason}): ${method} ${withoutQuery(url)}`);
    this.name = "EndpointNotAllowedError";
    this.method = method;
    this.url = url;
  }
}
