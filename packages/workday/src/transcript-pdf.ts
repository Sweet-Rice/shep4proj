import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedPdfText {
  pages: ExtractedPdfPage[];
  text: string;
}

/**
 * Extracts embedded text in page order from a transcript PDF. The caller owns
 * the input bytes; PDF.js receives a copy because its worker may transfer them.
 * This does not OCR scanned pages.
 */
export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdfText> {
  const loadingTask = getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  try {
    const document = await loadingTask.promise;
    const pages: ExtractedPdfPage[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      pages.push({ pageNumber, text: text.trim() });
      page.cleanup();
    }

    return { pages, text: pages.map((page) => page.text).join("\n\f\n") };
  } finally {
    await loadingTask.destroy();
  }
}
