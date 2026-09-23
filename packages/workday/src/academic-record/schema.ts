/**
 * zod schemas for the slice of the Workday "View My Academic Record"
 * response that the parser relies on.
 *
 * These are intentionally lenient about extra keys (Workday's real payload
 * has ~70 top-level keys and deeply nested UI config we don't care about)
 * but strict about the shapes we actually read: grids, rows, columns, and
 * cells. Every object schema uses `.passthrough()` so unknown sibling keys
 * never fail validation.
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
    value: z.number().optional(),
    format: z.string().optional(),
    precision: z.number().optional(),
  })
  .passthrough();

export const RowSchema = z
  .object({
    id: z.unknown().optional(),
    rowIndex: z.number(),
    cellsMap: z.record(z.string(), CellSchema),
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
