import { describe, expect, it } from "vitest";
import { redactQueryString, redactUrl, redactUrlPath } from "./headers.ts";

describe("redactQueryString", () => {
  it("redacts values for clientRequestID as well as the existing sensitive names", () => {
    const url = redactQueryString(
      "https://wd5.myworkday.com/lsu/d/api/v1/x?clientRequestID=abc123def456&term=Fall2025",
    );
    expect(url).toContain("clientRequestID=REDACTED");
    expect(url).toContain("term=Fall2025");
    expect(url).not.toContain("abc123def456");
  });
});

describe("redactUrlPath", () => {
  it("replaces a huge embedded attachment token in the path with <token>", () => {
    const longToken = "aB3" + "xY9zQ7wP".repeat(120);
    const url = `https://www.myworkday.com/lsu/attachment/17213$8/${longToken}`;
    const redacted = redactUrlPath(url);
    expect(redacted).not.toContain(longToken);
    expect(redacted).toContain("TOKEN");
    // short, mostly-numeric instance id segment is also token-shaped and redacted
    expect(redacted).toContain("/lsu/attachment/");
  });

  it("leaves a normal Workday task path unchanged", () => {
    const url = "https://www.myworkday.com/lsu/d/task/2998$30300.htmld";
    expect(redactUrlPath(url)).toBe(url);
  });
});

describe("redactUrl", () => {
  it("redacts both token-shaped path segments and sensitive query values", () => {
    const longToken = "aB3" + "xY9zQ7wP".repeat(120);
    const url = `https://www.myworkday.com/lsu/attachment/17213$8/${longToken}?clientRequestID=deadbeefdeadbeefdeadbeefdeadbeef`;
    const redacted = redactUrl(url);
    expect(redacted).not.toContain(longToken);
    expect(redacted).not.toContain("deadbeefdeadbeefdeadbeefdeadbeef");
    expect(redacted).toContain("TOKEN");
    expect(redacted).toContain("clientRequestID=REDACTED");
  });
});
