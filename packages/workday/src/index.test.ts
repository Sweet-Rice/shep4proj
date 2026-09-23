import { describe, expect, it } from "vitest";
import { isPlaceholder } from "./index.js";

describe("workday", () => {
  it("is a placeholder for now", () => {
    expect(isPlaceholder()).toBe(true);
  });
});
