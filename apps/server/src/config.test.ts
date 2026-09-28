import { describe, expect, it } from "vitest";
import { DEFAULT_HOST, DEFAULT_PORT, readListenConfig } from "./config.js";

describe("readListenConfig", () => {
  it("defaults to localhost:3000", () => {
    expect(readListenConfig({})).toEqual({ host: DEFAULT_HOST, port: DEFAULT_PORT });
    expect(DEFAULT_HOST).toBe("127.0.0.1");
  });

  it("treats blank values as unset", () => {
    expect(readListenConfig({ HOST: " ", PORT: "" })).toEqual({
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
    });
  });

  it("reads HOST and PORT", () => {
    expect(readListenConfig({ HOST: "0.0.0.0", PORT: "8080" })).toEqual({
      host: "0.0.0.0",
      port: 8080,
    });
  });

  it("allows port 0 (pick a free port)", () => {
    expect(readListenConfig({ PORT: "0" }).port).toBe(0);
  });

  it.each(["abc", "80.5", "-1", "65536", "3000abc"])("rejects PORT=%s", (port) => {
    expect(() => readListenConfig({ PORT: port })).toThrow(/PORT must be an integer/);
  });
});
