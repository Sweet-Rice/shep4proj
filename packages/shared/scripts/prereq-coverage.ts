import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { toPrereqRecord } from "../dist/index.js";

const CorpusSchema = z.object({
  entries: z.array(
    z.object({
      code: z.string(),
      text: z.string(),
    }),
  ),
});

const corpusUrl = new URL("../../../fixtures/prereqs/corpus.json", import.meta.url);
const corpusPath = fileURLToPath(corpusUrl);

function main(): void {
  if (!existsSync(corpusPath)) {
    console.error(`Corpus file not found at: ${corpusPath}`);
    process.exit(1);
  }

  let rawContent: string;
  try {
    rawContent = readFileSync(corpusPath, "utf-8");
  } catch (error) {
    console.error(
      `Failed to read corpus file: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (error) {
    console.error(
      `Corpus is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  const parseResult = CorpusSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    console.error("Corpus validation failed:", parseResult.error.message);
    process.exit(1);
  }

  const { entries } = parseResult.data;
  let cleanCount = 0;
  const flagged: Array<{ code: string; reviewReason: string }> = [];

  for (const entry of entries) {
    const record = toPrereqRecord(entry.text);
    if (record.needsReview) {
      flagged.push({
        code: entry.code,
        reviewReason: record.reviewReason ?? "unknown reason",
      });
    } else {
      cleanCount++;
    }
  }

  const total = entries.length;
  const pct = total === 0 ? "0.0" : ((cleanCount / total) * 100).toFixed(1);

  const lines: string[] = [
    `Prereq coverage: ${cleanCount}/${total} parsed cleanly (${pct}%)`,
    `Flagged (${flagged.length}):`,
    ...flagged.map((item) => `  ${item.code}: ${item.reviewReason}`),
  ];

  const output = lines.join("\n") + "\n";
  process.stdout.write(output);

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile && summaryFile.trim().length > 0) {
    try {
      appendFileSync(summaryFile, output, "utf-8");
    } catch (error) {
      console.error(
        `Failed to append to GITHUB_STEP_SUMMARY: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

main();
