import { describe, expect, it } from "vitest";
import { currentSemesterStart } from "./scrape-policy.js";

describe("currentSemesterStart", () => {
  it.each([
    ["2026-01-01T00:00:00Z", "2026-01-01T00:00:00.000Z"],
    ["2026-05-31T23:59:00Z", "2026-01-01T00:00:00.000Z"],
    ["2026-06-01T00:00:00Z", "2026-06-01T00:00:00.000Z"],
    ["2026-07-31T23:59:00Z", "2026-06-01T00:00:00.000Z"],
    ["2026-08-01T00:00:00Z", "2026-08-01T00:00:00.000Z"],
    ["2026-12-31T23:59:00Z", "2026-08-01T00:00:00.000Z"],
  ])("returns the window start for %s", (input, expected) => {
    expect(currentSemesterStart(new Date(input))).toEqual(new Date(expected));
  });
});
