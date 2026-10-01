import { describe, expect, it } from "vitest";
import { describeDesktop, DegreeProgressScreen, DegreeProgressView } from "./index.js";

describe("desktop", () => {
  it("depends on the shared package", () => {
    expect(describeDesktop()).toContain("@jevschedule/shared");
  });

  it("exports degree progress components", () => {
    expect(DegreeProgressScreen).toBeDefined();
    expect(DegreeProgressView).toBeDefined();
  });
});
