import { describe, expect, it } from "vitest";
import { createLogger, type LogLevel, type LogSink } from "./logger.js";

const secret = ["fake", "cookie", "value", "0123456789"].join("-");

/** Collects every line written, per level. */
function captureSink() {
  const lines: { level: LogLevel; line: string }[] = [];
  const sink: LogSink = {
    debug: (line) => lines.push({ level: "debug", line }),
    info: (line) => lines.push({ level: "info", line }),
    warn: (line) => lines.push({ level: "warn", line }),
    error: (line) => lines.push({ level: "error", line }),
  };
  return { sink, lines, all: () => lines.map((l) => l.line).join("\n") };
}

describe("createLogger", () => {
  it("writes each level to the matching sink method", () => {
    const { sink, lines } = captureSink();
    const log = createLogger(sink);
    log.debug("a");
    log.info("b");
    log.warn("c");
    log.error("d");
    expect(lines).toEqual([
      { level: "debug", line: "a" },
      { level: "info", line: "b" },
      { level: "warn", line: "c" },
      { level: "error", line: "d" },
    ]);
  });

  it("joins arguments with spaces and inspects non-strings", () => {
    const { sink, lines } = captureSink();
    createLogger(sink).info("imported", 21, "courses", { withdrawn: 2 });
    expect(lines[0]?.line).toBe("imported 21 courses { withdrawn: 2 }");
  });

  it("keeps an error's stack frames readable", () => {
    const { sink, lines } = captureSink();
    createLogger(sink).error(new Error("boom"));
    expect(lines[0]?.line).toContain("Error: boom");
    expect(lines[0]?.line).toMatch(/logger\.test\.ts:\d+:\d+/);
  });

  it.each<[string, unknown[]]>([
    ["a string", [`Cookie: sid=${secret}`]],
    ["a nested object", [{ request: { headers: { cookie: `sid=${secret}` } } }]],
    ["an object with a token field", [{ sessionSecureToken: secret }]],
    ["an error message", [new Error(`request rejected, token=${secret}`)]],
    [
      "an error cause",
      [new Error("import failed", { cause: new Error(`Authorization: Bearer ${secret}`) })],
    ],
    ["a URL argument", [new URL(`https://www.myworkday.com/lsu/app-root?session=${secret}`)]],
  ])("never writes the secret from %s", (_label, args) => {
    const { sink, all } = captureSink();
    const log = createLogger(sink);
    for (const level of ["debug", "info", "warn", "error"] as const) log[level](...args);
    expect(all()).not.toContain(secret);
  });
});
