#!/usr/bin/env node
/**
 * Structure-only dump of Workday `generic-hub`/`.htmld` JSON responses in a
 * captured HAR (T-320, issue #136).
 *
 * We know the academic record's `widget: "grid"` shape (T-312), but the
 * "View My Courses" task's response shape is unknown and must not be
 * guessed (see SECURITY.md, ENDPOINTS.md "Pending capture"). This script
 * lets a human inspect *structure* — grid labels, row counts, column
 * id/label pairs, enclosing panel/panelList labels — from a capture
 * without ever printing cell values, instance text, or names, so the
 * output itself is safe to paste into an issue/PR even though the source
 * HAR never is.
 *
 * Usage:
 *   pnpm --filter @jevschedule/workday inspect:grids [--in <file.har>]
 *
 * Defaults to the newest `.har` file in fixtures/workday/raw/ (git-ignored,
 * never committed, never read by an AI agent per SECURITY.md). Pure
 * filtering/formatting logic lives in `inspect-grids-lib.ts` so it can be
 * unit tested with synthetic HAR data.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { inspectHar, isHar } from "./inspect-grids-lib.ts";

function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

function parseArgs(argv: string[]): { in: string | undefined } {
  let inFile: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--in") {
      inFile = argv[++i];
    }
  }
  return { in: inFile };
}

function findNewestHar(dir: string): string {
  if (!existsSync(dir)) {
    throw new Error(
      `No --in given and ${dir} does not exist. Pass --in <path-to-har> pointing at a captured local HAR.`,
    );
  }
  const candidates = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".har"))
    .map((f) => join(dir, f));
  if (candidates.length === 0) {
    throw new Error(`No .har files found in ${dir}. Pass --in <path-to-har>.`);
  }
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0]!;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const defaultDir = resolve(root, "fixtures/workday/raw");
  const harPath = resolve(args.in ?? findNewestHar(defaultDir));

  console.log(`reading: ${harPath}`);
  const harText = readFileSync(harPath, "utf8");
  const parsed: unknown = JSON.parse(harText);

  if (!isHar(parsed)) {
    throw new Error(`${harPath} does not look like a HAR file (missing log.entries).`);
  }

  const { lines, matchedCount } = inspectHar(parsed);
  for (const line of lines) {
    console.log(line);
  }

  console.log(`\n${matchedCount} matching JSON response(s) under /generic-hub/ or *.htmld.`);
}

main();
