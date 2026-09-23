#!/usr/bin/env node
/**
 * One-command Workday traffic capture (T-311, issue #79).
 *
 * Replaces the manual "open DevTools, save a HAR by hand" workflow in the
 * wiki's Workday-Capture-Guide with a single command:
 *
 *   pnpm --filter @jevschedule/workday capture --pii "Your Name,YourID,you@lsu.edu"
 *
 * What it does:
 *   1. Launches Edge/Chrome via `launchWorkdayBrowser`, recording a HAR of
 *      only `*.myworkday.com` traffic using Playwright's own `recordHar`
 *      (no manual response listeners needed — see `extraLaunchOptions` on
 *      `launchWorkdayBrowser`).
 *   2. Waits for the human to complete myLSU + Microsoft SSO + Duo
 *      (`waitForWorkdayLogin`), then automatically navigates to "View My
 *      Academic Record" (the source of truth — see wiki Data-Sources.md)
 *      and waits for the network to go idle.
 *   3. Lets the human click around further (e.g. expand a term) and press
 *      Enter when done, capped at 5 minutes.
 *   4. Tears down the browser (which flushes the HAR to
 *      `fixtures/workday/raw/<timestamp>.har` — git-ignored; this script
 *      refuses to run if that ever stops being true).
 *   5. Runs the redactor in-process on the raw capture, writing one JSON
 *      fixture per kept request to `fixtures/workday/redacted/<timestamp>/`.
 *   6. Prints a summary table (file, method, url path, status, mimeType,
 *      bytes, leftover hits, local classification) and highlights the
 *      entry most likely to carry the academic record. Never prints
 *      response bodies, cookies, or header values.
 *
 * See SECURITY.md: Workday session data never leaves this machine. This
 * script makes no network calls of its own beyond what the browser does.
 */
import { execFileSync } from "node:child_process";
import { promises as fs, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import type { Page } from "playwright-core";

import {
  launchWorkdayBrowser,
  teardownWorkdayBrowser,
  waitForWorkdayLogin,
  WORKDAY_TENANT_URL,
} from "../dist/browser/index.js";
// The redactor lives on T-311-capture-tooling (PR #128). It is imported
// straight from source (matching that package's own `redact-har.ts` CLI
// convention) rather than from `dist`, since it has no build step of its
// own. If this import fails to resolve, PR #128 hasn't been merged into
// this branch yet.
import { DEFAULT_HOSTS, redactHar, scanForLeftovers } from "../src/redact/index.ts";
import type { Har, RedactedRequest } from "../src/redact/index.ts";
import { shortPathSlug } from "../src/redact/safety.ts";

import {
  classifyResponse,
  jsonTopLevelKeys,
  pickLikelyRecordEntry,
  WORKDAY_HAR_URL_FILTER,
  type ResponseClass,
} from "./capture-lib.ts";

/** "View My Academic Record" — the source of truth for completed courses (see wiki Data-Sources.md). */
const ACADEMIC_RECORD_URL = "https://www.myworkday.com/lsu/d/task/2998$30300.htmld";

const ENTER_WAIT_CAP_MS = 5 * 60 * 1000;

interface CliArgs {
  pii: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const pii: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pii") {
      const raw = argv[++i] ?? "";
      for (const p of raw.split(",")) {
        const trimmed = p.trim();
        if (trimmed) pii.push(trimmed);
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { pii };
}

function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

/** Aborts unless `absPath` is git-ignored. Never write an unredacted capture where git could pick it up. */
function assertGitIgnored(absPath: string, cwd: string): void {
  try {
    execFileSync("git", ["check-ignore", "-q", absPath], { cwd, stdio: "ignore" });
  } catch (err) {
    const status = (err as { status?: number }).status;
    console.error(
      `Refusing to capture: "${path.relative(cwd, absPath)}" is not covered by .gitignore ` +
        `(git check-ignore exit ${status ?? "unknown"}). Fix .gitignore before capturing — ` +
        "a raw capture must never be committable.",
    );
    process.exit(1);
  }
}

function timestampSlug(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

/** Waits for Enter on stdin, capped at `capMs`. Never echoes or logs what (if anything) was typed. */
function waitForEnter(capMs: number): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      rl.close();
      resolve();
    };
    const timer = setTimeout(finish, capMs);
    rl.once("line", finish);
    rl.once("close", finish);
  });
}

interface RawHarEntry {
  startedDateTime: string;
  request: { method: string; url: string };
}

function hostAllowed(url: string, hosts: readonly string[]): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.some((h) => {
    const suffix = h.toLowerCase();
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  });
}

function byteLen(text: string | null | undefined): number {
  return text ? Buffer.byteLength(text, "utf8") : 0;
}

interface SummaryRow {
  file: string;
  method: string;
  urlPath: string;
  status: number;
  mimeType: string;
  bytes: number;
  leftoverHits: number;
  classification: ResponseClass;
  likelyAcademicRecord: boolean;
}

function printSummary(rows: SummaryRow[]): void {
  const headers = [
    "file",
    "method",
    "url path",
    "status",
    "mimeType",
    "bytes",
    "leftover hits",
    "class",
  ];
  const cellsFor = (r: SummaryRow): string[] => [
    r.likelyAcademicRecord ? `* ${r.file}` : r.file,
    r.method,
    r.urlPath,
    String(r.status),
    r.mimeType,
    String(r.bytes),
    String(r.leftoverHits),
    r.classification,
  ];
  const rowsCells = rows.map(cellsFor);
  const widths = headers.map((h, i) => Math.max(h.length, ...rowsCells.map((c) => c[i]!.length)));
  const fmt = (cells: string[]): string => cells.map((c, i) => c[i]!.padEnd(widths[i]!)).join("  ");
  console.log(fmt(headers));
  console.log(fmt(widths.map((w) => "-".repeat(w))));
  for (const cells of rowsCells) {
    console.log(fmt(cells));
  }
}

async function redactCapture(opts: {
  rawPath: string;
  redactedDir: string;
  pii: string[];
  navigatedAt: Date;
  root: string;
}): Promise<void> {
  const { rawPath, redactedDir, pii, navigatedAt, root } = opts;

  await fs.mkdir(redactedDir, { recursive: true });
  assertGitIgnored(rawPath, root); // still true post-write; belt & suspenders.

  const harText = await fs.readFile(rawPath, "utf8");
  const har = JSON.parse(harText) as Har;
  const rawEntries = (har.log?.entries ?? []) as unknown as RawHarEntry[];

  // Mirror redactHar's own host filter so `matchingRawEntries[i]` lines up
  // positionally with `redacted[i]` below (redactHar only filters, it
  // never reorders).
  const matchingRawEntries = rawEntries.filter((e) => hostAllowed(e.request.url, DEFAULT_HOSTS));
  const redacted: RedactedRequest[] = redactHar(har, { hosts: DEFAULT_HOSTS, pii });

  const analyzed = redacted.map((entry, idx) => {
    const rawEntry = matchingRawEntries[idx];
    const afterNavigation = rawEntry ? new Date(rawEntry.startedDateTime) >= navigatedAt : false;
    const classification = classifyResponse(entry.responseBody);
    let urlPath: string;
    try {
      urlPath = new URL(entry.url).pathname;
    } catch {
      urlPath = entry.url;
    }
    return {
      entry,
      idx,
      afterNavigation,
      classification,
      urlPath,
      bytes: byteLen(entry.responseBody),
    };
  });

  const likely = pickLikelyRecordEntry(analyzed);

  const rows: SummaryRow[] = [];
  let anyLeftovers = false;

  for (const { entry, idx, classification, urlPath, bytes } of analyzed) {
    const nn = String(idx + 1).padStart(2, "0");
    const fileSlug = shortPathSlug(entry.url);
    const fileName = `${nn}-${entry.method.toLowerCase()}-${fileSlug}.json`;
    const filePath = path.join(redactedDir, fileName);

    const serialized = JSON.stringify(entry, null, 2);
    writeFileSync(filePath, serialized + "\n", "utf8");

    const hits = scanForLeftovers(serialized, pii);
    if (hits.length > 0) anyLeftovers = true;

    rows.push({
      file: fileName,
      method: entry.method,
      urlPath,
      status: entry.status,
      mimeType: entry.mimeType ?? "",
      bytes,
      leftoverHits: hits.length,
      classification,
      likelyAcademicRecord: likely?.idx === idx,
    });

    // Local-only classification detail: top-level JSON key names, never values.
    if (classification === "json") {
      const keys = jsonTopLevelKeys(entry.responseBody ?? "");
      if (keys && keys.length > 0) {
        console.log(`  ${fileName} top-level keys: ${keys.join(", ")}`);
      }
    }
  }

  printSummary(rows);
  console.log(
    `\nWrote ${redacted.length} redacted request(s) to ${path.relative(root, redactedDir)} ` +
      `(input: ${path.basename(rawPath)}).`,
  );

  if (likely) {
    console.log(
      `\nMost likely to carry the academic record: a ${likely.classification} response at ${likely.urlPath} (${likely.bytes} bytes).`,
    );
  } else {
    console.log(
      "\nNo entry clearly matched the academic-record task id or stood out as the largest post-navigation JSON response — review the table above by hand.",
    );
  }

  if (anyLeftovers) {
    console.error(
      "\nLeftover scan found possible PII/tokens still present. Review the files above before committing.",
    );
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();

  const now = new Date();
  const slug = timestampSlug(now);
  const rawDir = path.resolve(root, "fixtures/workday/raw");
  const rawPath = path.join(rawDir, `${slug}.har`);
  const redactedDir = path.resolve(root, "fixtures/workday/redacted", slug);

  await fs.mkdir(rawDir, { recursive: true });
  assertGitIgnored(rawPath, root);

  console.log("Launching Workday browser...");
  const session = await launchWorkdayBrowser({
    startUrl: WORKDAY_TENANT_URL,
    extraLaunchOptions: {
      recordHar: { path: rawPath, content: "embed", urlFilter: WORKDAY_HAR_URL_FILTER },
    },
  });
  let torndown = false;

  try {
    console.log("Waiting for login (complete myLSU + Microsoft SSO + Duo in the opened window)...");
    const loginResult = await waitForWorkdayLogin(session);
    if (loginResult.status !== "success") {
      console.error(
        loginResult.status === "timeout"
          ? "Timed out waiting for login."
          : `Login was cancelled (${loginResult.reason}).`,
      );
      return;
    }

    const page = session.page as unknown as Page;
    const navigatedAt = new Date();
    await page.goto(ACADEMIC_RECORD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    console.log("Captured. You can also click around (e.g. expand a term); press Enter when done.");
    await waitForEnter(ENTER_WAIT_CAP_MS);

    await teardownWorkdayBrowser(session);
    torndown = true;

    const rawStat = await fs.stat(rawPath).catch(() => null);
    if (!rawStat) {
      throw new Error(`Expected a raw HAR at ${rawPath} after teardown, but none was written.`);
    }

    await redactCapture({ rawPath, redactedDir, pii: args.pii, navigatedAt, root });
  } finally {
    if (!torndown) {
      await teardownWorkdayBrowser(session).catch(() => {});
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
