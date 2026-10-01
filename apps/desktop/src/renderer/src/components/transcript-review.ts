import { CourseCodeSchema } from "@jevschedule/shared";
import type { TranscriptParseResult as PdfParseResult } from "@jevschedule/workday";
import { isCompletedGrade } from "../../../shared/workday-import.js";
import type { TranscriptParseResult } from "./ImportReviewScreen.js";

/** Only completed, catalog-compatible courses can enter the completed store. */
export function toTranscriptReview(result: PdfParseResult): TranscriptParseResult {
  const parsedCourses: TranscriptParseResult["parsedCourses"] = [];
  const unrecognizedLines = result.unrecognizedLines.map(
    (line) => `${line.code} (page ${line.pageNumber}: ${line.reason})`,
  );
  const seen = new Set<string>();
  for (const course of result.courses) {
    if (!isCompletedGrade(course.grade)) continue;
    const code = CourseCodeSchema.safeParse(course.code);
    if (!code.success) {
      unrecognizedLines.push(`${course.code} (catalog course code not supported)`);
      continue;
    }
    if (seen.has(code.data)) continue;
    seen.add(code.data);
    parsedCourses.push({
      code: code.data,
      term: course.term ? `${course.term.season} ${course.term.year}` : "Credit by exam",
      grade: course.grade,
      selected: true,
    });
  }
  return { parsedCourses, unrecognizedLines };
}
