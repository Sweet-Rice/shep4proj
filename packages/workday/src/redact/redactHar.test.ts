import { describe, expect, it } from "vitest";
import type { Har } from "./har-types.ts";
import { redactHar } from "./redactHar.ts";
import { scanForLeftovers } from "./scanForLeftovers.ts";
import { makeFakeJwtForTests } from "./test-helpers.ts";

// A hand-written, entirely synthetic HAR fixture. Names, tokens, and IDs
// below are made up for this test - never a real capture.
const COOKIE_VALUE = "sid=fakesession12345secret";
const AUTH_VALUE = "Bearer fake-bearer-token-value-000111222";
// Built at runtime (never a real credential) so this test doesn't contain a
// JWT-shaped string literal - planted so the leftover scanner test below has
// something to catch.
const PLANTED_JWT = makeFakeJwtForTests();

function buildSyntheticHar(): Har {
  return {
    log: {
      entries: [
        {
          request: {
            method: "GET",
            url: "https://wd5.myworkday.com/lsu/d/api/academic/v1/students/me/transcript?csrf_token=abc123&term=Fall2025",
            headers: [
              { name: "Cookie", value: COOKIE_VALUE },
              { name: "Authorization", value: AUTH_VALUE },
              { name: "X-Csrf-Token", value: "csrf-value-xyz" },
              { name: "Accept", value: "application/json" },
            ],
          },
          response: {
            status: 200,
            headers: [
              { name: "Set-Cookie", value: COOKIE_VALUE },
              { name: "Content-Type", value: "application/json" },
            ],
            content: {
              mimeType: "application/json",
              text: JSON.stringify({
                studentName: "Jane Doe",
                studentId: "890123456",
                email: "jane.doe@lsu.edu",
                phone: "225-555-1234",
                accessToken: PLANTED_JWT,
                note: "Advisor comment for Jane Doe: doing well.",
                courses: [
                  {
                    courseCode: "CSC 1350",
                    courseTitle: "Data Structures",
                    term: "Fall 2025",
                    grade: "A",
                    credits: 3,
                    sectionId: "SEC-9001",
                  },
                ],
              }),
            },
          },
        },
        {
          request: {
            method: "GET",
            url: "https://cdn.example.com/static/app.js",
            headers: [],
          },
          response: {
            status: 200,
            headers: [],
            content: { mimeType: "application/javascript", text: "console.log(1)" },
          },
        },
      ],
    },
  };
}

const PII = ["Jane Doe", "890123456", "jane.doe@lsu.edu"];

describe("redactHar", () => {
  it("drops entries whose host isn't in the allowlist", () => {
    const result = redactHar(buildSyntheticHar(), { pii: PII });
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toContain("myworkday.com");
  });

  it("never leaks cookie or authorization header values", () => {
    const result = redactHar(buildSyntheticHar(), { pii: PII });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(COOKIE_VALUE);
    expect(serialized).not.toContain(AUTH_VALUE);
    expect(serialized).not.toContain("csrf-value-xyz");
    // but the fact that these headers existed is preserved as names only
    expect(result[0]?.requestHeaderNames.map((n) => n.toLowerCase())).toEqual(
      expect.arrayContaining(["cookie", "authorization", "x-csrf-token"]),
    );
    expect(result[0]?.responseHeaderNames.map((n) => n.toLowerCase())).toEqual(
      expect.arrayContaining(["set-cookie"]),
    );
  });

  it("redacts sensitive query string values but keeps the keys", () => {
    const result = redactHar(buildSyntheticHar(), { pii: PII });
    const url = result[0]?.url ?? "";
    expect(url).toContain("csrf_token=REDACTED");
    expect(url).toContain("term=Fall2025");
    expect(url).not.toContain("abc123");
  });

  it("replaces every occurrence of a PII string with the same stable fake", () => {
    const result = redactHar(buildSyntheticHar(), { pii: PII });
    const body = result[0]?.responseBody ?? "";
    expect(body).not.toContain("Jane Doe");
    const parsed = JSON.parse(body);
    expect(parsed.studentName).toBe(parsed.studentName);
    // both occurrences of "Jane Doe" (field + free text) become the same fake
    expect(parsed.note).toContain(parsed.studentName);
  });

  it("fakes emails, phone numbers, and long-digit ids", () => {
    const result = redactHar(buildSyntheticHar(), { pii: PII });
    const parsed = JSON.parse(result[0]?.responseBody ?? "{}");
    expect(parsed.email).not.toBe("jane.doe@lsu.edu");
    expect(parsed.email).toMatch(/@example\.edu$/);
    expect(parsed.phone).not.toBe("225-555-1234");
    expect(parsed.studentId).not.toBe("890123456");
    expect(parsed.studentId).toMatch(/^STUDENT-\d{4}$/);
  });

  it("is deterministic across separate calls", () => {
    const a = redactHar(buildSyntheticHar(), { pii: PII });
    const b = redactHar(buildSyntheticHar(), { pii: PII });
    expect(a).toEqual(b);
  });

  it("leaves course codes, terms, grades, and credits intact", () => {
    const result = redactHar(buildSyntheticHar(), { pii: PII });
    const parsed = JSON.parse(result[0]?.responseBody ?? "{}");
    const course = parsed.courses[0];
    expect(course.courseCode).toBe("CSC 1350");
    expect(course.courseTitle).toBe("Data Structures");
    expect(course.term).toBe("Fall 2025");
    expect(course.grade).toBe("A");
    expect(course.credits).toBe(3);
  });

  it("leaves a JWT embedded under an unrecognized key for the leftover scanner to catch", () => {
    const result = redactHar(buildSyntheticHar(), { pii: PII });
    const body = result[0]?.responseBody ?? "";
    const hits = scanForLeftovers(body, PII);
    expect(hits.some((h) => h.type === "jwt")).toBe(true);
  });
});
