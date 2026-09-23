import { describe, expect, it } from "vitest";
import { describeServer } from "./index.js";

describe("server", () => {
  it("depends on the shared package", () => {
    expect(describeServer()).toContain("@jevschedule/shared");
  });
});
