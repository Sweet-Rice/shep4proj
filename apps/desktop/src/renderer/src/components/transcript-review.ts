import { CourseCodeSchema, type CourseCode } from "@jevschedule/shared";
import type { TranscriptParseResult as PdfParseResult } from "@jevschedule/workday";
import { NOT_IN_CATALOG_REASON } from "../../../shared/catalog-membership.js";
import { isCompletedGrade } from "../../../shared/workday-import.js";
import type { TranscriptParseResult } from "./ImportReviewScreen.js";

/** Only completed courses present in the catalog can enter the completed store. */
export function toTranscriptReview(
  result: PdfParseResult,
  catalog: ReadonlySet<CourseCode>,
): TranscriptParseResult {
  const parsedCourses: TranscriptParseResult["parsedCourses"] = [];
  const unrecognizedLines = result.unrecognizedLines.map(
    (line) => `${line.code} (page ${line.pageNumber}: ${line.reason})`,
  );
  const seen = new Set<string>();
  for (const course of result.courses) {
    if (!isCompletedGrade(course.grade)) continue;
    const code = CourseCodeSchema.safeParse(course.code);
    if (!code.success) {
      unrecognizedLines.push(`${course.code} (unrecognized course code format)`);
      continue;
    }
    if (!catalog.has(code.data)) {
      unrecognizedLines.push(`${code.data} — ${NOT_IN_CATALOG_REASON}`);
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
