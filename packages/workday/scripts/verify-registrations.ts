#!/usr/bin/env node
/**
 * Local, human-run verification for the current-registrations parser
 * (T-320).
 *
 * Takes a captured HAR (default: the newest file in fixtures/workday/raw/,
 * which is never committed and never read by an AI agent — see
 * SECURITY.md), runs it through extractCurrentRegistrationsFromHar +
 * parseCurrentRegistrations, and prints ONLY: the enrolled course count,
 * then per course its code, credit hours, registration status, derived
 * term, section count, and each section's instructional format + delivery
 * mode. It never prints the instructor, meeting patterns/times, student
 * name, or ID.
 *
 * Usage:
 *   pnpm --filter @jevschedule/workday verify:registrations [--in <file.har>]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { extractCurrentRegistrationsFromHar } from "../src/current-registrations/har.ts";
import { parseCurrentRegistrations } from "../src/current-registrations/parse.ts";
import { WorkdayShapeError, type CurrentCourse } from "../src/current-registrations/types.ts";

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

function printCourse(course: CurrentCourse): void {
  console.log(`  ${course.code}`);
  console.log(`    credit hours: ${course.creditHours ?? "(unknown)"}`);
  console.log(`    registration status: ${course.registrationStatus ?? "(unknown)"}`);
  console.log(`    term: ${course.term ? course.term.label : "(unknown)"}`);
  console.log(`    sections: ${course.sections.length}`);
  for (const section of course.sections) {
    console.log(
      `      instructional format: ${section.instructionalFormat ?? "(unknown)"}, ` +
        `delivery mode: ${section.deliveryMode ?? "(unknown)"}`,
    );
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const harPath = resolve(args.in ?? findNewestHar(DEFAULT_RAW_DIR));

  console.log(`reading: ${harPath}`);
  const harText = readFileSync(harPath, "utf8");
  const har: unknown = JSON.parse(harText);

  let result;
  try {
    const json = extractCurrentRegistrationsFromHar(har);
    result = parseCurrentRegistrations(json);
  } catch (error) {
    if (error instanceof WorkdayShapeError) {
      console.log(`WorkdayShapeError at path: ${error.path}`);
      console.log(`message: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  console.log(`enrolled courses: ${result.enrolled.length}`);
  for (const course of result.enrolled) {
    printCourse(course);
  }

  console.log(`dropped/withdrawn courses: ${result.dropped.length}`);
  for (const course of result.dropped) {
    console.log(`  ${course.code}`);
  }

  console.log(`unrecognized rows: ${result.unrecognizedRows.length}`);
  for (const row of result.unrecognizedRows) {
    console.log(`  [${row.gridLabel}] row ${row.rowIndex}: ${row.reason}`);
  }
}

main();
