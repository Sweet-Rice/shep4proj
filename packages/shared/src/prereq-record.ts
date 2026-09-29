import { z } from "zod";
import { PrereqNodeSchema } from "./prereq.js";
import { parsePrereqText } from "./prereq-parser.js";

export const PrereqRecordSchema = z.object({
  rawText: z.string().nullable(),
  tree: PrereqNodeSchema.nullable(),
  needsReview: z.boolean(),
  reviewReason: z.string().nullable(),
  notes: z.array(z.string()),
});

export type PrereqRecord = z.infer<typeof PrereqRecordSchema>;

/**
 * Parses prerequisite text into a {@link PrereqRecord}, retaining the verbatim
 * raw text and flagging unparseable or ambiguous prerequisites for human review.
 */
export function toPrereqRecord(text: string | null): PrereqRecord {
  if (text === null || text.trim().length === 0) {
    return {
      rawText: null,
      tree: null,
      needsReview: false,
      reviewReason: null,
      notes: [],
    };
  }

  try {
    const res = parsePrereqText(text);
    if (res.ok) {
      return {
        rawText: text,
        tree: res.tree,
        needsReview: false,
        reviewReason: null,
        notes: res.notes,
      };
    }
    return {
      rawText: text,
      tree: null,
      needsReview: true,
      reviewReason: `${res.reason}: ${res.detail}`,
      notes: [],
    };
  } catch (error) {
    return {
      rawText: text,
      tree: null,
      needsReview: true,
      reviewReason: `parser-error: ${error instanceof Error ? error.message : String(error)}`,
      notes: [],
    };
  }
}
