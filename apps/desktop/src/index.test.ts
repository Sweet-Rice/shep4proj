import { describe, expect, it } from "vitest";
import { describeDesktop } from "./index.js";

describe("desktop", () => {
  it("depends on the shared package", () => {
    expect(describeDesktop()).toContain("@jevschedule/shared");
  });
});
