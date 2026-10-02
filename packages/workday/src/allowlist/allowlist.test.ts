import { describe, expect, it, vi } from "vitest";
import { ALLOWED_ENDPOINTS } from "./allowed-endpoints.js";
import { assertAllowed } from "./assert-allowed.js";
import { DENY_PATTERNS } from "./deny-patterns.js";
import { EndpointNotAllowedError } from "./errors.js";
import { guardedFetch } from "./guarded-fetch.js";
import type { AllowedEndpoint } from "./types.js";
const academicRecord: AllowedEndpoint = {
  id: "academic-record-get",
  method: "GET",
  pattern: /^https:\/\/example\.myworkday\.com\/api\/academic-record\/[^/]+$/,
  description: "Read the student's completed-course academic record.",
};

describe("assertAllowed", () => {
  it("rejects everything when the allowlist is empty", () => {
    expect(() => assertAllowed("GET", "https://example.myworkday.com/api/x", [])).toThrow(
      EndpointNotAllowedError,
    );
  });

  it("passes a request whose method and URL match an allowlist entry", () => {
    expect(() =>
      assertAllowed("GET", "https://example.myworkday.com/api/academic-record/12345", [
        academicRecord,
      ]),
    ).not.toThrow();
  });

  it("rejects a matching URL with the wrong method", () => {
    expect(() =>
      assertAllowed("POST", "https://example.myworkday.com/api/academic-record/12345", [
        academicRecord,
      ]),
    ).toThrow(EndpointNotAllowedError);
  });

  it("rejects a URL matching a deny pattern even if it's allowlisted", () => {
    const registrationEndpoint: AllowedEndpoint = {
      id: "sneaky-registration",
      method: "GET",
      pattern: /^https:\/\/example\.myworkday\.com\/api\/registration\/[^/]+$/,
      description: "Should never actually be allowed.",
    };

    expect(() =>
      assertAllowed("GET", "https://example.myworkday.com/api/registration/12345", [
        registrationEndpoint,
      ]),
    ).toThrow(EndpointNotAllowedError);
  });

  it("excludes query-string values from the error message", () => {
    try {
      assertAllowed(
        "GET",
        "https://example.myworkday.com/api/academic-record?studentId=super-secret-123",
        [],
      );
      throw new Error("expected assertAllowed to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EndpointNotAllowedError);
      const message = (error as Error).message;
      expect(message).not.toContain("super-secret-123");
      expect(message).not.toContain("studentId");
    }
  });
});

describe("ALLOWED_ENDPOINTS: app-root-get", () => {
  it("allows only GET on the LSU app-root endpoint", () => {
    const appRoot = ALLOWED_ENDPOINTS.find((endpoint) => endpoint.id === "app-root-get");
    expect(appRoot).toBeDefined();
    expect(() =>
      assertAllowed("GET", "https://www.myworkday.com/lsu/app-root", [appRoot!]),
    ).not.toThrow();
    expect(() =>
      assertAllowed("POST", "https://www.myworkday.com/lsu/app-root", [appRoot!]),
    ).toThrow(EndpointNotAllowedError);
  });
});

describe("ALLOWED_ENDPOINTS: academic-record-get", () => {
  it("allows the task/2998$30300.htmld variant with a clientRequestID query", () => {
    expect(() =>
      assertAllowed(
        "GET",
        "https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld?clientRequestID=11111111-1111-4111-8111-111111111111",
        ALLOWED_ENDPOINTS,
      ),
    ).not.toThrow();
  });

  it("allows the page-context-id/<contextId>.htmld variant", () => {
    expect(() =>
      assertAllowed(
        "GET",
        "https://www.myworkday.com/lsu/generic-hub/page-context-id/abc123XYZ.htmld",
        ALLOWED_ENDPOINTS,
      ),
    ).not.toThrow();
  });

  it("rejects the hub-nav URL (/lsu/task/2998$30300.htmld) — no course data", () => {
    expect(() =>
      assertAllowed(
        "GET",
        "https://www.myworkday.com/lsu/task/2998$30300.htmld",
        ALLOWED_ENDPOINTS,
      ),
    ).toThrow(EndpointNotAllowedError);
  });

  it("rejects the registration API", () => {
    expect(() =>
      assertAllowed(
        "GET",
        "https://www.myworkday.com/wday/sirg/protectedapi/asorInternal/v1/lsu/registration",
        ALLOWED_ENDPOINTS,
      ),
    ).toThrow(EndpointNotAllowedError);
  });

  it("rejects POST to the academic-record URL", () => {
    expect(() =>
      assertAllowed(
        "POST",
        "https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld",
        ALLOWED_ENDPOINTS,
      ),
    ).toThrow(EndpointNotAllowedError);
  });
});
describe("ALLOWED_ENDPOINTS: academic-progress-get", () => {
  const url = "https://www.myworkday.com/lsu/generic-hub/task/2998$43459.htmld";

  it("allows the observed read-only task endpoint", () => {
    expect(() =>
      assertAllowed(
        "GET",
        `${url}?clientRequestID=11111111-1111-4111-8111-111111111111`,
        ALLOWED_ENDPOINTS,
      ),
    ).not.toThrow();
  });

  it("rejects POST and continues to enforce deny patterns", () => {
    expect(() => assertAllowed("POST", url, ALLOWED_ENDPOINTS)).toThrow(EndpointNotAllowedError);
    expect(() =>
      assertAllowed(
        "GET",
        "https://www.myworkday.com/lsu/generic-hub/task/registration.htmld",
        ALLOWED_ENDPOINTS,
      ),
    ).toThrow(EndpointNotAllowedError);
    expect(DENY_PATTERNS.some((pattern) => pattern.test(url))).toBe(false);
  });
});

describe("ALLOWED_ENDPOINTS: current-registrations-get", () => {
  it("allows the direct task/2998$28771.htmld GET for the importer to try", () => {
    expect(() =>
      assertAllowed(
        "GET",
        "https://www.myworkday.com/lsu/generic-hub/task/2998$28771.htmld?clientRequestID=22222222-2222-4222-8222-222222222222",
        ALLOWED_ENDPOINTS,
      ),
    ).not.toThrow();
  });

  it("allows the shared page-context-id/<contextId>.htmld variant (same pattern as academic-record-get)", () => {
    expect(() =>
      assertAllowed(
        "GET",
        "https://www.myworkday.com/lsu/generic-hub/page-context-id/c4.htmld",
        ALLOWED_ENDPOINTS,
      ),
    ).not.toThrow();
  });

  it("rejects POST to the registrations URL", () => {
    expect(() =>
      assertAllowed(
        "POST",
        "https://www.myworkday.com/lsu/generic-hub/page-context-id/c4.htmld",
        ALLOWED_ENDPOINTS,
      ),
    ).toThrow(EndpointNotAllowedError);
  });

  it("rejects the hub-nav URL (/lsu/task/2998$28771.htmld) — no course data", () => {
    expect(() =>
      assertAllowed(
        "GET",
        "https://www.myworkday.com/lsu/task/2998$28771.htmld",
        ALLOWED_ENDPOINTS,
      ),
    ).toThrow(EndpointNotAllowedError);
  });

  it("rejects the registration write API and the drop API - the deny patterns win over any allowlist entry", () => {
    expect(() =>
      assertAllowed(
        "GET",
        "https://www.myworkday.com/wday/sirg/protectedapi/asorInternal/v1/lsu/registration",
        ALLOWED_ENDPOINTS,
      ),
    ).toThrow(EndpointNotAllowedError);

    expect(() =>
      assertAllowed(
        "POST",
        "https://www.myworkday.com/wday/sirg/protectedapi/asorInternal/v1/lsu/drop",
        ALLOWED_ENDPOINTS,
      ),
    ).toThrow(EndpointNotAllowedError);
  });

  it("isn't incidentally caught by DENY_PATTERNS: task id 2998$28771 contains neither 'regist' nor 'drop'", () => {
    const url = "https://www.myworkday.com/lsu/generic-hub/task/2998$28771.htmld";
    expect(/regist/i.test(url)).toBe(false);
    expect(/drop/i.test(url)).toBe(false);
    for (const pattern of DENY_PATTERNS) {
      expect(pattern.test(url)).toBe(false);
    }
  });
});

describe("guardedFetch", () => {
  it("calls the supplied session fetch for an allowed request", async () => {
    const fetch = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true }) }));
    const result = await guardedFetch(
      fetch,
      { method: "GET", url: "https://example.myworkday.com/api/academic-record/12345" },
      [academicRecord],
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: 200, json: { ok: true } });
  });

  it("never calls the fetch implementation when the request is rejected", async () => {
    const fetch = vi.fn();
    await expect(
      guardedFetch(
        fetch,
        { method: "GET", url: "https://example.myworkday.com/api/not-allowlisted" },
        [academicRecord],
      ),
    ).rejects.toThrow(EndpointNotAllowedError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never calls the fetch implementation when the URL matches a deny pattern", async () => {
    const fetch = vi.fn();
    const registrationEndpoint: AllowedEndpoint = {
      id: "sneaky-registration",
      method: "POST",
      pattern: /^https:\/\/example\.myworkday\.com\/api\/registration\/[^/]+$/,
      description: "Should never actually be allowed.",
    };
    await expect(
      guardedFetch(
        fetch,
        { method: "POST", url: "https://example.myworkday.com/api/registration/12345" },
        [registrationEndpoint],
      ),
    ).rejects.toThrow(EndpointNotAllowedError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
