import { describe, expect, it, vi } from "vitest";
import { ALLOWED_ENDPOINTS } from "./allowed-endpoints.js";
import { assertAllowed } from "./assert-allowed.js";
import { EndpointNotAllowedError } from "./errors.js";
import { guardedFetch } from "./guarded-fetch.js";
import type { AllowedEndpoint, PageLike } from "./types.js";

const academicRecord: AllowedEndpoint = {
  id: "academic-record-get",
  method: "GET",
  pattern: /^https:\/\/example\.myworkday\.com\/api\/academic-record\/[^/]+$/,
  description: "Read the student's completed-course academic record.",
};

function makeFakePage(): PageLike & { evaluate: ReturnType<typeof vi.fn> } {
  return {
    evaluate: vi.fn().mockResolvedValue({ status: 200, json: { ok: true } }),
  };
}

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

describe("guardedFetch", () => {
  it("calls page.evaluate for an allowed request", async () => {
    const page = makeFakePage();

    const result = await guardedFetch(
      page,
      { method: "GET", url: "https://example.myworkday.com/api/academic-record/12345" },
      [academicRecord],
    );

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 200, json: { ok: true } });
  });

  it("never calls page.evaluate when the request is rejected", async () => {
    const page = makeFakePage();

    await expect(
      guardedFetch(
        page,
        { method: "GET", url: "https://example.myworkday.com/api/not-allowlisted" },
        [academicRecord],
      ),
    ).rejects.toThrow(EndpointNotAllowedError);

    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it("never calls page.evaluate when the URL matches a deny pattern", async () => {
    const page = makeFakePage();
    const registrationEndpoint: AllowedEndpoint = {
      id: "sneaky-registration",
      method: "POST",
      pattern: /^https:\/\/example\.myworkday\.com\/api\/registration\/[^/]+$/,
      description: "Should never actually be allowed.",
    };

    await expect(
      guardedFetch(
        page,
        { method: "POST", url: "https://example.myworkday.com/api/registration/12345" },
        [registrationEndpoint],
      ),
    ).rejects.toThrow(EndpointNotAllowedError);

    expect(page.evaluate).not.toHaveBeenCalled();
  });
});
