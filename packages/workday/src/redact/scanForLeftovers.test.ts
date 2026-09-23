import { describe, expect, it } from "vitest";
import { scanForLeftovers } from "./scanForLeftovers.ts";
import { makeFakeJwtForTests } from "./test-helpers.ts";

describe("scanForLeftovers", () => {
  it("finds a PII string that is still present", () => {
    const hits = scanForLeftovers("Report for Jane Doe attached.", ["Jane Doe"]);
    expect(hits).toEqual(expect.arrayContaining([{ type: "pii", match: "Jane Doe" }]));
  });

  it("finds a leftover email address", () => {
    const hits = scanForLeftovers("contact jane.doe@lsu.edu for details", []);
    expect(hits.some((h) => h.type === "email")).toBe(true);
  });

  it("finds a leftover phone number", () => {
    const hits = scanForLeftovers("call 225-555-1234 now", []);
    expect(hits.some((h) => h.type === "phone")).toBe(true);
  });

  it("finds a planted JWT", () => {
    const jwt = makeFakeJwtForTests();
    const hits = scanForLeftovers(`token: ${jwt}`, []);
    expect(hits.some((h) => h.type === "jwt")).toBe(true);
  });

  it("finds a leftover long hex token", () => {
    // Built at runtime, not a literal, so no hex-secret-shaped string sits in source.
    const fakeHex = "deadbeef".repeat(4);
    const hits = scanForLeftovers(`key=${fakeHex}`, []);
    expect(hits.some((h) => h.type === "hex-token")).toBe(true);
  });

  it("does not false-positive on a plain URL path", () => {
    const hits = scanForLeftovers(
      "https://wd5.myworkday.com/lsu/d/api/academic/v1/students/12345/transcript",
      [],
    );
    expect(hits).toHaveLength(0);
  });

  it("does not flag our own faked emails or student ids", () => {
    const hits = scanForLeftovers(
      JSON.stringify({ email: "student.42@example.edu", studentId: "STUDENT-0007" }),
      [],
    );
    expect(hits).toHaveLength(0);
  });

  it("returns no hits on clean text", () => {
    expect(scanForLeftovers("CSC 1350, Fall 2025, grade A", ["Jane Doe"])).toEqual([]);
  });
});
