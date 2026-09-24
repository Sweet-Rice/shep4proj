/**
 * zod schemas for the slice of the Workday "View My Courses" (current-term
 * registrations) response that the parser relies on.
 *
 * Mirrors `../academic-record/schema.ts`'s approach: lenient about extra
 * keys (every object schema uses `.passthrough()`), strict about the shapes
 * we actually read. The real response shape is unknown (see ENDPOINTS.md
 * "Pending capture" / T-320) — only grid/column/row structure was observed
 * via `inspect:grids`, never cell values — so this schema is deliberately
 * more permissive than the academic record's on `value`, since a date cell
 * may hold a string rather than a number.
 */
import { z } from "zod";

export const InstanceSchema = z
  .object({
    instanceId: z.unknown().optional(),
    text: z.string().optional(),
    v: z.unknown().optional(),
    pv: z.unknown().optional(),
    rt: z.unknown().optional(),
    widget: z.string().optional(),
  })
  .passthrough();

export const CellSchema = z
  .object({
    widget: z.string().optional(),
    label: z.string().optional(),
    instances: z.array(InstanceSchema).optional(),
    text: z.string().optional(),
    // Unlike the academic record's numeric-only cells, a date cell here may
    // carry a string value instead of a number - be lenient about which.
    value: z.union([z.number(), z.string()]).optional(),
    format: z.string().optional(),
    precision: z.number().optional(),
  })
  .passthrough();

export const RowSchema = z
  .object({
    id: z.unknown().optional(),
    rowIndex: z.number(),
    cellsMap: z.record(z.string(), CellSchema),
    /** Present (non-empty) on Workday's own grid-total row. See academic-record/schema.ts. */
    subtotalColumnIds: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .passthrough();

export const ColumnSchema = z
  .object({
    columnId: z.union([z.string(), z.number()]),
    widget: z.string().optional(),
    propertyName: z.string().optional(),
    label: z.string().optional(),
  })
  .passthrough();

export const GridSchema = z
  .object({
    widget: z.literal("grid"),
    label: z.string().optional(),
    gridId: z.union([z.string(), z.number()]).optional(),
    columns: z.array(ColumnSchema),
    rows: z.array(RowSchema),
    rowCount: z.number().optional(),
    hasSubtotal: z.boolean().optional(),
    subtotalRowCount: z.number().optional(),
  })
  .passthrough();

export const RootSchema = z
  .object({
    body: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export type Instance = z.infer<typeof InstanceSchema>;
export type Cell = z.infer<typeof CellSchema>;
export type Row = z.infer<typeof RowSchema>;
export type Column = z.infer<typeof ColumnSchema>;
export type Grid = z.infer<typeof GridSchema>;
