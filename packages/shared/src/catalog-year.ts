import { z } from "zod";

/** Academic catalog year as two calendar years (e.g. "2026-2027"). */
export const CatalogYearSchema = z.string().regex(/^\d{4}-\d{4}$/);

export type CatalogYear = z.infer<typeof CatalogYearSchema>;
