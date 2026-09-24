#!/usr/bin/env node
/**
 * One-command Workday traffic capture (T-311, issue #79; extended for
 * current-term registrations in T-320, issue #136).
 *
 * Replaces the manual "open DevTools, save a HAR by hand" workflow in the
 * wiki's Workday-Capture-Guide with a single command:
 *
 *   pnpm --filter @jevschedule/workday capture --pii "Your Name,YourID,you@lsu.edu"
 *
 * Optional flags:
 *   --task-url <url>   After the academic record, also navigate to this
 *                       task page and let it load before the final prompt.
 *                       For once the "View My Courses" (or another)
 *                       endpoint is known and we want to drive straight to
 *                       it instead of relying on the human to search for
 *                       it by hand. Omit it (the default) when the
 *                       endpoint is still unknown, per ENDPOINTS.md
 *                       "Pending capture" - never guess the URL.
 *
 * What it does:
 *   1. Launches Edge/Chrome via `launchWorkdayBrowser`, recording a HAR of
 *      only `*.myworkday.com` traffic using Playwright's own `recordHar`
 *      (no manual response listeners needed — see `extraLaunchOptions` on
 *      `launchWorkdayBrowser`). `recordHar` is attached at the *context*
 *      level (not a specific page), so it keeps recording even if Duo MFA
 *      closes or swaps the tab mid-login.
 *   2. Waits for the human to complete myLSU + Microsoft SSO + Duo
 *      (`waitForWorkdayLogin`), then automatically navigates to "View My
 *      Academic Record" (the source of truth — see wiki Data-Sources.md)
 *      and waits for the network to go idle. Uses whichever page the login
 *      result reports (or, failing that, whatever's currently open in the
 *      context) rather than assuming the original tab is still around —
 *      see `resolveActivePage`. If `--task-url` was given, also navigates
 *      there next.
 *   3. Prompts the human to open "View My Courses" by hand (type it into
 *      the Workday search bar, pick the task, wait for current courses to
 *      show) and press Enter when done, capped at 5 minutes. This is the
 *      single Enter wait for the whole capture.
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
import type { PageLike, WaitForWorkdayLoginResult } from "../dist/browser/index.js";
// The redactor is imported straight from source (matching that package's
// own `redact-har.ts` CLI convention) rather than from `dist`, since it has
// no build step of its own.
import { DEFAULT_HOSTS, redactHar, scanForLeftovers } from "../src/redact/index.ts";
import type { Har, RedactedRequest } from "../src/redact/index.ts";
import { shortPathSlug } from "../src/redact/safety.ts";

import {
  classifyResponse,
  jsonTopLevelKeys,
  pickLikelyAcademicRecordEntry,
  pickLikelyRegistrationsEntry,
  WORKDAY_HAR_URL_FILTER,
  type ResponseClass,
} from "./capture-lib.ts";

/** "View My Academic Record" — the source of truth for completed courses (see wiki Data-Sources.md). */
const ACADEMIC_RECORD_URL = "https://www.myworkday.com/lsu/d/task/2998$30300.htmld";

const ENTER_WAIT_CAP_MS = 5 * 60 * 1000;

interface CliArgs {
  pii: string[];
  /**
   * Extra task page to navigate to after the academic record, for when the
   * "View My Courses" (or another) endpoint's URL is known and we want the
   * script to drive straight to it instead of relying on the human to type
   * it into the Workday search bar (T-320).
   */
  taskUrl: string | undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const pii: string[] = [];
  let taskUrl: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pii") {
      const raw = argv[++i] ?? "";
      for (const p of raw.split(",")) {
        const trimmed = p.trim();
        if (trimmed) pii.push(trimmed);
      }
    } else if (arg === "--task-url") {
      taskUrl = argv[++i];
      if (!taskUrl) {
        throw new Error("--task-url requires a value");
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { pii, taskUrl };
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

/**
 * `waitForWorkdayLogin`'s result type doesn't (yet, as of this writing)
 * carry a `page` — but Duo MFA is known to close or swap the tab mid-flow
 * (see T-314-follow-pages), so a fix there may start returning
 * `{ status: "success", page }` for the page that actually matched. Coded
 * defensively against both shapes: prefer `result.page` when present,
 * otherwise fall back to whatever page is currently open in the context
 * (not necessarily `session.page`, which may have been closed/replaced).
 */
function resolveActivePage(
  session: { context: { pages(): PageLike[] }; page: PageLike },
  loginResult: WaitForWorkdayLoginResult & { page?: PageLike },
): PageLike {
  if (loginResult.page) {
    return loginResult.page;
  }
  const openPages = session.context.pages();
  return openPages[openPages.length - 1] ?? session.page;
}

interface SummaryRow {
  file: string;
  method: string;
  urlPath: string;
  status: number;
  mimeType: string;
  bytes: number;
  leftoverHits: number;
  classification: ResponseClass | "write-error";
  likelyAcademicRecord: boolean;
  likelyRegistrations: boolean;
  writeError?: string;
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
    "write error",
  ];
  const markerFor = (r: SummaryRow): string => {
    if (r.likelyAcademicRecord && r.likelyRegistrations) return "*+ ";
    if (r.likelyAcademicRecord) return "* ";
    if (r.likelyRegistrations) return "+ ";
    return "";
  };
  const cellsFor = (r: SummaryRow): string[] => [
    `${markerFor(r)}${r.file}`,
    r.method,
    r.urlPath,
    String(r.status),
    r.mimeType,
    String(r.bytes),
    String(r.leftoverHits),
    r.classification,
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
      bodyText: entry.responseBody,
    };
  });

  const likelyRecord = pickLikelyAcademicRecordEntry(analyzed);
  const likelyRegistrations = pickLikelyRegistrationsEntry(analyzed);

  const rows: SummaryRow[] = [];
  let anyLeftovers = false;
  let anyWriteErrors = false;
  let written = 0;

  for (const { entry, idx, classification, urlPath, bytes } of analyzed) {
    const nn = String(idx + 1).padStart(2, "0");
    const fileSlug = shortPathSlug(entry.url);
    const fileName = `${nn}-${entry.method.toLowerCase()}-${fileSlug}.json`;
    const filePath = path.join(redactedDir, fileName);

    const serialized = JSON.stringify(entry, null, 2);

    // A per-file write failure (filesystem limit, permissions, disk full)
    // must not abort the whole capture - report it in the summary table
    // and keep going so the rest of the capture is still redacted.
    try {
      writeFileSync(filePath, serialized + "\n", "utf8");
      written++;
    } catch (err) {
      anyWriteErrors = true;
      const message = err instanceof Error ? err.message : String(err);
      rows.push({
        file: fileName,
        method: entry.method,
        urlPath,
        status: entry.status,
        mimeType: entry.mimeType ?? "",
        bytes,
        leftoverHits: 0,
        classification: "write-error",
        likelyAcademicRecord: false,
        likelyRegistrations: false,
        writeError: message,
      });
      continue;
    }

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
      likelyAcademicRecord: likelyRecord?.idx === idx,
      likelyRegistrations: likelyRegistrations?.idx === idx,
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
    `\nWrote ${written} of ${redacted.length} redacted request(s) to ${path.relative(root, redactedDir)} ` +
      `(input: ${path.basename(rawPath)}).`,
  );

  if (anyWriteErrors) {
    console.error(
      "\nOne or more files failed to write - see the write error column above. The rest of the run still completed.",
    );
  }

  if (likelyRecord) {
    console.log(
      `\nMost likely to carry the academic record: a ${likelyRecord.classification} response at ${likelyRecord.urlPath} (${likelyRecord.bytes} bytes).`,
    );
  } else {
    console.log(
      "\nNo entry's body contained an academic-record-shaped grid — review the table above by hand.",
    );
  }

  if (likelyRegistrations) {
    console.log(
      `Most likely to carry current registrations: a ${likelyRegistrations.classification} response at ${likelyRegistrations.urlPath} (${likelyRegistrations.bytes} bytes).`,
    );
  } else {
    console.log(
      "No entry's body contained a current-registrations-shaped grid — review the table above by hand.",
    );
  }

  if (anyLeftovers) {
    // Deliberately not process.exitCode = 1 here: this is a local review aid
    // (the human reads the leftover-hits column and decides), not a hard
    // failure - a nonzero exit here was confusing since the run itself
    // succeeded. The strict redact:har CLI (used for a final, standalone
    // redaction) still exits nonzero on leftovers.
    console.error(
      "\nLeftover scan found possible PII/tokens still present. Review the files above before committing.",
    );
  }

  if (anyWriteErrors) {
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

    const activePageLike = resolveActivePage(session, loginResult);
    const page = activePageLike as unknown as Page;
    const navigatedAt = new Date();
    await page.goto(ACADEMIC_RECORD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    if (args.taskUrl) {
      console.log(`Navigating to extra task page: ${args.taskUrl}`);
      await page.goto(args.taskUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
    }

    // T-320: the academic record only lists graded enrollments, not
    // current-term registrations. "View My Courses" is the likely source
    // for those, but its endpoint is unknown and must not be guessed (see
    // ENDPOINTS.md "Pending capture") - so we ask the human to drive to it
    // by hand rather than navigating there ourselves. This is the single
    // Enter wait for the whole capture; nothing after it waits again.
    console.log(
      "Now open View My Courses: type it in the Workday search bar, pick the task, and " +
        "wait until your current courses show. Press Enter when done.",
    );
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
