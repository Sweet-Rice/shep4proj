#!/usr/bin/env node
/**
 * CLI: redact a Chrome DevTools HAR capture of Workday traffic into
 * reviewable, committable JSON fixtures.
 *
 * Runs entirely offline against a local .har file. Never makes a network
 * call, never prints request/response body content to stdout.
 *
 * Usage:
 *   node scripts/redact-har.ts --in <file.har> --out <dir> \
 *     [--pii "Full Name,1234567,name@example.edu"] [--host suffix ...]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { DEFAULT_HOSTS, redactHar } from "../src/redact/redactHar.ts";
import { scanForLeftovers } from "../src/redact/scanForLeftovers.ts";
import { isRawDir, shortPathSlug } from "../src/redact/safety.ts";
import type { Har } from "../src/redact/har-types.ts";
import type { RedactedRequest } from "../src/redact/redactHar.ts";

interface CliArgs {
  in: string;
  out: string;
  pii: string[];
  hosts: string[];
}

function parseArgs(argv: string[]): CliArgs {
  let inFile: string | undefined;
  let outDir = "fixtures/workday/redacted/";
  const pii: string[] = [];
  const hosts: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--in":
        inFile = argv[++i];
        break;
      case "--out":
        outDir = argv[++i] ?? outDir;
        break;
      case "--pii": {
        const raw = argv[++i] ?? "";
        for (const p of raw.split(",")) {
          const trimmed = p.trim();
          if (trimmed) pii.push(trimmed);
        }
        break;
      }
      case "--host":
        hosts.push(argv[++i] ?? "");
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!inFile) {
    throw new Error("--in <file.har> is required");
  }
  return { in: inFile, out: outDir, pii, hosts };
}

/**
 * Refuse an --out that git would silently ignore: fixtures written there
 * would never actually be committable, defeating the point of redaction.
 */
function isGitIgnored(outDir: string): boolean {
  const probe = resolve(outDir, ".redact-har-probe");
  try {
    execFileSync("git", ["check-ignore", "-q", probe], { stdio: "ignore" });
    return true; // exit code 0 => ignored
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 1) return false; // not ignored
    // git not available or other error: fail closed by treating as ignored
    // only when we can't prove otherwise AND the path also isn't under the
    // repo's fixtures/ convention.
    return false;
  }
}

interface SummaryRow {
  file: string;
  urlPath: string;
  status: number;
  leftoverHits: number;
  writeError?: string;
}

function printSummary(rows: SummaryRow[]): void {
  const headers = ["file", "url path", "status", "leftover hits", "write error"];
  const cellsFor = (r: SummaryRow): string[] => [
    r.file,
    r.urlPath,
    String(r.status),
    String(r.leftoverHits),
    r.writeError ?? "",
  ];
  const rowsCells = rows.map(cellsFor);
  const widths = headers.map((h, i) => Math.max(h.length, ...rowsCells.map((c) => c[i]!.length)));
  const fmt = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  console.log(fmt(headers));
  console.log(fmt(widths.map((w) => "-".repeat(w))));
  for (const cells of rowsCells) {
    console.log(fmt(cells));
  }
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (isRawDir(args.out)) {
    console.error(
      `Refusing to write to "${args.out}": paths under a "raw/" directory are reserved for unredacted captures and must never be written to by this tool.`,
    );
    process.exit(1);
  }

  const outAbs = resolve(args.out);
  // Create the directory first so git check-ignore has something real to
  // probe relative to (it doesn't need the dir to exist, but resolve does).
  mkdirSync(outAbs, { recursive: true });
  if (isGitIgnored(args.out)) {
    console.error(
      `Refusing to write to "${args.out}": this path is excluded by .gitignore, so fixtures written here could never be committed. Pick an --out that isn't git-ignored.`,
    );
    process.exit(1);
  }

  if (!existsSync(args.in)) {
    console.error(`Input file not found: ${args.in}`);
    process.exit(1);
  }
  const harText = readFileSync(args.in, "utf8");
  const har = JSON.parse(harText) as Har;

  const hosts = args.hosts.length > 0 ? args.hosts : DEFAULT_HOSTS;
  const redacted: RedactedRequest[] = redactHar(har, { hosts, pii: args.pii });

  const rows: SummaryRow[] = [];
  let anyLeftovers = false;
  let anyWriteErrors = false;
  let written = 0;

  redacted.forEach((entry, idx) => {
    const nn = String(idx + 1).padStart(2, "0");
    const slug = shortPathSlug(entry.url);
    const fileName = `${nn}-${entry.method.toLowerCase()}-${slug}.json`;
    const filePath = resolve(outAbs, fileName);

    let urlPath: string;
    try {
      urlPath = new URL(entry.url).pathname;
    } catch {
      urlPath = entry.url;
    }

    const serialized = JSON.stringify(entry, null, 2);

    // A write failure for one entry (e.g. a filesystem limit even after
    // slug shortening, permissions, disk full) must not abort the whole
    // run - report it in the summary and keep going so the rest of the
    // capture is still redacted and written.
    try {
      writeFileSync(filePath, serialized + "\n", "utf8");
      written++;
    } catch (err) {
      anyWriteErrors = true;
      const message = err instanceof Error ? err.message : String(err);
      rows.push({
        file: fileName,
        urlPath,
        status: entry.status,
        leftoverHits: 0,
        writeError: message,
      });
      return;
    }

    const hits = scanForLeftovers(serialized, args.pii);
    if (hits.length > 0) anyLeftovers = true;

    rows.push({
      file: fileName,
      urlPath,
      status: entry.status,
      leftoverHits: hits.length,
    });
  });

  printSummary(rows);
  console.log(
    `\nWrote ${written} of ${redacted.length} redacted request(s) to ${args.out} (input: ${basename(args.in)}).`,
  );

  if (anyWriteErrors) {
    console.error(
      "\nOne or more files failed to write - see the write error column above. The rest of the run still completed.",
    );
  }

  if (anyLeftovers) {
    console.error(
      "\nLeftover scan found possible PII/tokens still present. Review the files above before committing.",
    );
  }

  if (anyWriteErrors || anyLeftovers) {
    process.exit(1);
  }
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
