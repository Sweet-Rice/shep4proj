import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(import.meta.dirname, "redact-har.ts");

// Synthetic HAR only - never a real capture. Includes a planted JWT so we
// can also exercise the leftover-scan exit code.
function writeSyntheticHar(path: string): void {
  const har = {
    log: {
      entries: [
        {
          request: {
            method: "GET",
            url: "https://wd5.myworkday.com/lsu/d/api/academic/v1/students/12345/transcript",
            headers: [{ name: "Cookie", value: "sid=fake-session-value" }],
          },
          response: {
            status: 200,
            headers: [],
            content: {
              mimeType: "application/json",
              text: JSON.stringify({
                studentName: "Sam Sample",
                courseCode: "CSC 1350",
              }),
            },
          },
        },
      ],
    },
  };
  writeFileSync(path, JSON.stringify(har), "utf8");
}

describe("redact-har CLI", () => {
  it("refuses to write inside a raw/ output directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "redact-har-"));
    const harPath = join(dir, "capture.har");
    writeSyntheticHar(harPath);
    const outDir = join(dir, "fixtures", "workday", "raw", "redacted");

    expect(() =>
      execFileSync("node", [SCRIPT, "--in", harPath, "--out", outDir, "--pii", "Sam Sample"], {
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("writes one redacted JSON file per request and exits cleanly", () => {
    const dir = mkdtempSync(join(tmpdir(), "redact-har-"));
    const harPath = join(dir, "capture.har");
    writeSyntheticHar(harPath);
    const outDir = join(dir, "redacted");

    const output = execFileSync(
      "node",
      [SCRIPT, "--in", harPath, "--out", outDir, "--pii", "Sam Sample"],
      { encoding: "utf8" },
    );

    const files = readdirSync(outDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^01-get-.*\.json$/);

    const written = JSON.parse(readFileSync(join(outDir, files[0]!), "utf8"));
    expect(written.responseBody).not.toContain("Sam Sample");
    expect(output).not.toContain("Sam Sample");
  });
});
