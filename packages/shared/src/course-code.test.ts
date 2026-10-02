import { describe, expect, it } from "vitest";
import { CourseCodeSchema, toCatalogCode } from "./course-code.js";

describe("toCatalogCode", () => {
  it.each([
    ["CSC 4103G", "CSC 4103"],
    ["CSC 4890GE", "CSC 4890"],
    ["CSC 4103", "CSC 4103"],
  ])("maps %s to its catalog code", (input, expected) => {
    const parsed = CourseCodeSchema.parse(input);
    expect(toCatalogCode(parsed)).toBe(expected);
  });
});
