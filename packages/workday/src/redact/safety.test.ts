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
  it("drops numeric ids from the path, appending a uniqueness suffix", () => {
    const slug = shortPathSlug("https://wd5.myworkday.com/lsu/students/12345/transcript");
    // The numeric id is dropped (replaced with "id"), so a hash suffix is
    // appended to keep otherwise-identical-looking slugs unique.
    expect(slug).toMatch(/^lsu-students-id-transcript-[0-9a-f]{8}$/);
  });

  it("falls back to root for an empty path", () => {
    expect(shortPathSlug("https://wd5.myworkday.com")).toBe("root");
  });

  it("leaves a normal Workday task path unchanged (dollar-instance-id form)", () => {
    expect(shortPathSlug("https://www.myworkday.com/lsu/d/task/2998$30300.htmld")).toBe(
      "lsu-d-task-2998-30300-htmld",
    );
  });

  it("produces a short, token-free slug for a huge attachment URL with an embedded token", () => {
    const longToken = "aB3" + "xY9zQ7wP".repeat(120); // ~963 chars, base64-ish
    const anotherSegment = "kL8mN2oP4qR6sT1uV3wX5yZ7aB9cD0eF2gH4iJ6";
    const url = `https://www.myworkday.com/lsu/attachment/17213$8/${longToken}/${anotherSegment}`;
    const slug = shortPathSlug(url);

    expect(slug.length).toBeLessThanOrEqual(80);
    for (const seg of slug.split("-")) {
      expect(seg.length).toBeLessThanOrEqual(24);
    }
    expect(slug).not.toContain(longToken.toLowerCase());
    expect(slug).not.toContain(anotherSegment.toLowerCase());
    expect(slug.toLowerCase()).not.toContain("xy9zq7wp");
  });

  it("caps the slug length at 80 characters even for very long, non-token paths", () => {
    const longWords = Array.from({ length: 30 }, (_, i) => `segment-word-${i}`).join("/");
    const slug = shortPathSlug(`https://www.myworkday.com/${longWords}`);
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it("gives distinct URLs distinct slugs even when their ids all collapse to the same placeholder", () => {
    const a = shortPathSlug("https://wd5.myworkday.com/lsu/students/11111/transcript");
    const b = shortPathSlug("https://wd5.myworkday.com/lsu/students/22222/transcript");
    expect(a).not.toBe(b);
  });
});
