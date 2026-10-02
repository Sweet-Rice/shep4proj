import { CourseCodeSchema, toCatalogCode, type CourseCode } from "@jevschedule/shared";
import type { TranscriptParseResult as PdfParseResult } from "@jevschedule/workday";
import { NOT_IN_CATALOG_REASON } from "../../../shared/catalog-membership.js";
import {
  isCompletedGrade,
  isInProgressGrade,
  noCreditGradeReason,
} from "../../../shared/workday-import.js";
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
    const parsedCode = CourseCodeSchema.safeParse(course.code);
    if (!parsedCode.success) {
      unrecognizedLines.push(`${course.code} (unrecognized course code format)`);
      continue;
    }
    const code = toCatalogCode(parsedCode.data);
    if (isInProgressGrade(course.grade)) continue;
    if (!isCompletedGrade(course.grade)) {
      unrecognizedLines.push(`${code} — ${noCreditGradeReason(course.grade)}`);
      continue;
    }
    if (!catalog.has(code)) {
      unrecognizedLines.push(`${code} — ${NOT_IN_CATALOG_REASON}`);
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);
    parsedCourses.push({
      code,
      term: course.term ? `${course.term.season} ${course.term.year}` : "Credit by exam",
      grade: course.grade,
      selected: true,
    });
  }
  return { parsedCourses, unrecognizedLines };
}
