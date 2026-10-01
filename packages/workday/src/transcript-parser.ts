import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface TranscriptCourse {
  code: string;
  /** Null for credit earned by exam. */
  term: { season: "Spring" | "Summer" | "Fall" | "Winter"; year: number } | null;
  grade: string;
}

export interface UnrecognizedTranscriptLine {
  pageNumber: number;
  /** Course code only; student-identifying text is never returned. */
  code: string;
  reason: string;
}

export interface TranscriptParseResult {
  courses: TranscriptCourse[];
  unrecognizedLines: UnrecognizedTranscriptLine[];
}

interface PositionedText {
  x: number;
  y: number;
  text: string;
}

const CODE = /^([A-Z]{2,5}\s+\d{4}[A-Z]?)\b/;
const TERM = /^(Spring|Summer|Fall|Winter) Semester (20\d{2})\b/;
const GRADE =
  /^(A[+-]?|B[+-]?|C[+-]?|D[+-]?|F|P|Pass|IP|Audit|Withdr|Withdrawal|W)(?:\s*\(HNR\))?$/i;

function rows(items: PositionedText[]): PositionedText[][] {
  const result: PositionedText[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    // PDF.js sometimes places glyph runs from one baseline a fraction apart.
    const row = result.find((candidate) => Math.abs(candidate[0]!.y - item.y) < 1.5);
    if (row) row.push(item);
    else result.push([item]);
  }
  return result.map((row) => row.sort((a, b) => a.x - b.x));
}

/**
 * Parses either LSU Workday transcript layout from PDF bytes. Embedded text is
 * grouped by page position, because PDF content order can place an entire grade
 * column after the course column. Scanned image-only PDFs need OCR elsewhere.
 */
export async function parseTranscriptPdf(data: Uint8Array): Promise<TranscriptParseResult> {
  const task = getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  const courses: TranscriptCourse[] = [];
  const unrecognizedLines: UnrecognizedTranscriptLine[] = [];
  let term: TranscriptCourse["term"] = null;
  try {
    const pdf = await task.promise;
    let format: "unofficial" | "academic-record" | null = null;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PositionedText[] = content.items
        .filter(
          (item): item is typeof item & { str: string; transform: number[] } =>
            "str" in item && "transform" in item,
        )
        .filter((item) => item.str.trim().length > 0)
        .map((item) => ({ x: item.transform[4]!, y: item.transform[5]!, text: item.str.trim() }));
      if (format === null) {
        format = items.some((item) => item.text === "Unofficial Transcript")
          ? "unofficial"
          : items.some((item) => item.text.startsWith("View My Academic Record"))
            ? "academic-record"
            : null;
        if (format === null) throw new Error("unrecognized transcript format");
      }

      for (const row of rows(items)) {
        const line = row.map((item) => item.text).join(" ");
        if (/\b(?:Credit by Exam|Transfer Credit from Exams)\b/.test(line)) term = null;
        const heading = row.find((item) => TERM.test(item.text));
        if (heading) {
          const match = TERM.exec(heading.text)!;
          term = { season: match[1] as NonNullable<typeof term>["season"], year: Number(match[2]) };
        }

        const course = row.find(
          (item) =>
            CODE.test(item.text) &&
            (format === "unofficial" ? item.x > 15 && item.x < 320 : item.x >= 230 && item.x < 400),
        );
        if (!course) continue;
        const gradeColumn = row.find((item) => item.x > 320 && item.x < 480);
        // A wrapped title can look like a course code (e.g. "SINCE 1500").
        if (!gradeColumn) continue;
        const code = CODE.exec(course.text)![1]!;
        const gradeItem = row.find((item) => {
          if (format === "unofficial") return item.x > 400 && item.x < 480 && GRADE.test(item.text);
          return (
            item.x >= 320 &&
            item.x < 485 &&
            (GRADE.test(item.text) || /^\d+(?:\.\d+)?\s+(?:Pass|P)$/.test(item.text))
          );
        });
        if (!gradeItem) {
          unrecognizedLines.push({ pageNumber, code, reason: "grade not found on course row" });
          continue;
        }
        const rawGrade = gradeItem.text.replace(/^\d+(?:\.\d+)?\s+/, "").replace(/\s*\(HNR\)$/, "");
        const grade = rawGrade === "Withdr" ? "Withdrawal" : rawGrade;
        courses.push({ code, term, grade });
      }
      page.cleanup();
    }
    return { courses, unrecognizedLines };
  } finally {
    await task.destroy();
  }
}
