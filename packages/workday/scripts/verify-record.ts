#!/usr/bin/env node
/**
 * Local, human-run verification for the academic-record parser (T-312).
 *
 * Takes a captured HAR (default: the newest file in fixtures/workday/raw/,
 * which is never committed and never read by an AI agent — see
 * SECURITY.md), runs it through extractFromHar + parseAcademicRecord, and
 * prints ONLY counts and course codes. It never prints the row-descriptor
 * text, student name, ID, or raw response content.
 *
 * Usage:
 *   pnpm --filter @jevschedule/workday verify:record [--in <file.har>]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { extractFromHar } from "../src/academic-record/har.ts";
import { parseAcademicRecord } from "../src/academic-record/parse.ts";
import { WorkdayShapeError, type CompletedCourse } from "../src/academic-record/types.ts";

const DEFAULT_RAW_DIR = "fixtures/workday/raw";

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
      `No --in given and ${dir} does not exist. Pass --in <path-to-har> pointing at a captured, redacted-or-not local HAR.`,
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

function summarizeByStatus(courses: CompletedCourse[]): Record<string, number> {
  const counts: Record<string, number> = {
    completed: 0,
    "in-progress": 0,
    withdrawn: 0,
    failed: 0,
  };
  for (const course of courses) {
    counts[course.status] = (counts[course.status] ?? 0) + 1;
  }
  return counts;
}

function codesByTerm(courses: CompletedCourse[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const course of courses) {
    const key = course.term?.label ?? "(unknown term)";
    const list = map.get(key) ?? [];
    list.push(course.code);
    map.set(key, list);
  }
  return map;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const harPath = resolve(args.in ?? findNewestHar(DEFAULT_RAW_DIR));

  console.log(`reading: ${harPath}`);
  const harText = readFileSync(harPath, "utf8");
  const har: unknown = JSON.parse(harText);

  let result;
  try {
    const json = extractFromHar(har);
    result = parseAcademicRecord(json);
  } catch (error) {
    if (error instanceof WorkdayShapeError) {
      console.log(`WorkdayShapeError at path: ${error.path}`);
      console.log(`message: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const byTerm = codesByTerm(result.courses);
  console.log(`terms found: ${byTerm.size}`);

  const statusCounts = summarizeByStatus(result.courses);
  console.log("courses by status:");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log(`transfer credits: ${result.transferCredits.length}`);

  console.log(`unrecognized rows: ${result.unrecognizedRows.length}`);
  for (const row of result.unrecognizedRows) {
    console.log(`  [${row.gridLabel}] row ${row.rowIndex}: ${row.reason}`);
  }

  console.log("course codes by term:");
  for (const [term, codes] of byTerm) {
    console.log(`  ${term}: ${codes.join(", ")}`);
  }
}

main();
