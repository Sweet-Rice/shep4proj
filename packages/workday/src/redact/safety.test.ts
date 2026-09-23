import { describe, expect, it } from "vitest";
import { isRawDir, shortPathSlug } from "./safety.ts";

describe("isRawDir", () => {
  it("refuses paths with a raw/ segment", () => {
    expect(isRawDir("fixtures/workday/raw")).toBe(true);
    expect(isRawDir("fixtures/workday/raw/nested")).toBe(true);
    expect(isRawDir("/tmp/some/RAW/dir")).toBe(true);
  });

  it("allows paths without a raw/ segment", () => {
    expect(isRawDir("fixtures/workday/redacted")).toBe(false);
    expect(isRawDir("fixtures/workday/redacted-raw-ish")).toBe(false);
  });
});

describe("shortPathSlug", () => {
  it("drops numeric ids from the path", () => {
    expect(shortPathSlug("https://wd5.myworkday.com/lsu/students/12345/transcript")).toBe(
      "lsu-students-id-transcript",
    );
  });

  it("falls back to root for an empty path", () => {
    expect(shortPathSlug("https://wd5.myworkday.com")).toBe("root");
  });
});
