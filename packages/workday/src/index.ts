/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/workday";

/**
 * Placeholder for the Workday response parser and transcript PDF parser
 * that will live in this package. Pure, fixture-tested; never touches a
 * live Workday session.
 */
export function isPlaceholder(): boolean {
  return true;
}
export { extractPdfText } from "./transcript-pdf.js";
export type { ExtractedPdfPage, ExtractedPdfText } from "./transcript-pdf.js";
export { parseTranscriptPdf } from "./transcript-parser.js";
export type {
  TranscriptCourse,
  TranscriptParseResult,
  UnrecognizedTranscriptLine,
} from "./transcript-parser.js";
