/** HTTP methods the guard understands. Workday's internal UI endpoints are
 * read-only for our purposes even when they use POST, so both are covered.
 */
export type HttpMethod = "GET" | "POST";

/**
 * One entry in the Workday endpoint allowlist. Populated by T-311 from a
 * human's redacted DevTools capture; never guessed. See
 * `packages/workday/ENDPOINTS.md` for the corresponding documentation.
 */
export interface AllowedEndpoint {
  readonly id: string;
  readonly method: HttpMethod;
  readonly pattern: RegExp;
  readonly description: string;
}

/** A request the caller wants to make from inside a Workday page. */
export interface GuardedRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/** The result of a guarded call, once it has run inside the page. */
export interface GuardedResponse {
  readonly status: number;
  readonly json: unknown;
}

/**
 * Minimal slice of Playwright's `Page` needed to run a guarded fetch from
 * inside a Workday page. Kept separate from `playwright-core` so this
 * module is unit-testable without a real browser.
 */
export interface PageLike {
  evaluate<Arg, R>(pageFunction: (arg: Arg) => R | Promise<R>, arg: Arg): Promise<R>;
}
