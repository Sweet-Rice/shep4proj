/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/workday";

export { extractPdfText } from "./transcript-pdf.js";
export type { ExtractedPdfPage, ExtractedPdfText } from "./transcript-pdf.js";
export { parseTranscriptPdf } from "./transcript-parser.js";
export type {
  TranscriptCourse,
  TranscriptParseResult,
  UnrecognizedTranscriptLine,
} from "./transcript-parser.js";
