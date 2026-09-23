import { describe, expect, it } from "vitest";
import { greet, PACKAGE_NAME } from "./index.js";

describe("shared", () => {
  it("greets by name", () => {
    expect(greet("world")).toBe(`Hello, world, from ${PACKAGE_NAME}`);
  });
});
