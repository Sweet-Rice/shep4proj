import { z } from "zod";
import { CatalogYearSchema } from "./catalog-year.js";
import { CourseCodeSchema } from "./course-code.js";

const CREDITS_TEXT = /^\(?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*([^)]*?)\s*\)?$/;

/**
 * Credit hours for a course: an inclusive range plus any trailing catalog
 * wording (e.g. "per sem."). Fixed-credit courses have `min === max`.
 */
export interface Credits {
  min: number;
  max: number;
  note: string | null;
}

/**
 * Parses catalog credit text such as `"(4)"`, `"(1-3)"` or `"(1-12 per sem.)"`.
 * The surrounding parentheses are optional. A single number yields
 * `min === max`; any text after the number(s) is kept as `note`.
 *
 * Throws `Error("unrecognized credits text: <text>")` when no leading number is found.
 * The parsed range is not validated here; `CreditsSchema` rejects `min > max`.
 */
export function parseCreditsText(text: string): Credits {
  const match = CREDITS_TEXT.exec(text);
  const min = match?.[1];
  if (min === undefined) {
    throw new Error(`unrecognized credits text: ${text}`);
  }
  const max = match?.[2];
  return {
    min: Number(min),
    max: Number(max ?? min),
    note: match?.[3] || null,
  };
}

/**
 * Credits as a validated range. Accepts either a `{ min, max, note }` object or
 * catalog text, which is run through `parseCreditsText` first. Text that does
 * not parse is left as-is so validation fails with an issue instead of throwing.
 */
export const CreditsSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    try {
      return parseCreditsText(value);
    } catch {
      return value;
    }
  },
  z
    .object({
      min: z.number().finite().nonnegative(),
      max: z.number().finite().nonnegative(),
      note: z.string().nullable(),
    })
    .refine((credits) => credits.min <= credits.max, "credits min must be <= max"),
);

/**
 * Public catalog course data shared by the API and desktop app.
 *
 * `credits` is a range because the catalog lists variable-credit courses such as
 * "(1-12 per sem.)". A course's identity is `(catalogYear, code)`: the same code
 * can change title, credits and prerequisites between catalog years.
 */
export const CourseSchema = z.object({
  catalogYear: CatalogYearSchema,
  code: CourseCodeSchema,
  title: z.string().trim().min(1),
  credits: CreditsSchema,
  description: z.string().trim(),
  /** Original catalog wording, retained for prerequisite parsing and review. */
  prerequisiteText: z.string().nullable(),
});

/** The fields that identify a course: `(catalogYear, code)`. */
export const CourseKeySchema = CourseSchema.pick({ catalogYear: true, code: true });

export type Course = z.infer<typeof CourseSchema>;
export type CourseKey = z.infer<typeof CourseKeySchema>;
