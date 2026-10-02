import { z } from "zod";

import { findGrids, isPlainObject, type GridCandidate } from "../workday-json/find-grids.ts";
import { WorkdayShapeError, type AcademicProgressResult, type AcademicRequirementStatus } from "./types.ts";

const ProgressCellSchema = z.object({
  label: z.unknown().optional(),
  text: z.unknown().optional(),
  value: z.unknown().optional(),
  instances: z.array(z.object({ text: z.unknown().optional() }).passthrough()).optional(),
}).passthrough();
const ProgressRowSchema = z.object({
  rowIndex: z.number(),
  cellsMap: z.record(z.string(), ProgressCellSchema),
}).passthrough();
const ProgressGridSchema = z.object({
  widget: z.literal("grid"),
  label: z.string().optional(),
  columns: z.array(z.object({ columnId: z.union([z.string(), z.number()]), label: z.string().optional() }).passthrough()),
  rows: z.array(ProgressRowSchema),
}).passthrough();

type Grid = z.infer<typeof ProgressGridSchema>;
type Row = Grid["rows"][number];
type Cell = z.infer<typeof ProgressCellSchema>;

const COURSE_CODE_RE = /([A-Z]{2,4} \d{4}[A-Z]{0,2})/;
const BASE_COURSE_CODE_RE = /^([A-Z]{2,4} \d{4})[A-Z]{0,2}$/;

function shapeError(message: string, path: string): never {
  throw new WorkdayShapeError(message, path);
}

function parseGrid(candidate: GridCandidate): Grid {
  const parsed = ProgressGridSchema.safeParse(candidate.node);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const suffix = issue?.path.join(".");
    shapeError(`Grid at ${candidate.path} has an unexpected shape`, suffix ? `${candidate.path}.${suffix}` : candidate.path);
  }
  return parsed.data;
}

function resolveColumnId(grid: Grid, label: string, fallbackId: string): string | undefined {
  return grid.columns.find((column) => column.label?.trim().toLowerCase() === label.toLowerCase())?.columnId.toString()
    ?? (grid.columns.some((column) => column.columnId.toString() === fallbackId) ? fallbackId : undefined);
}

function resolveCellId(row: Row, label: string, fallbackId: string): string {
  return Object.entries(row.cellsMap).find(([, cell]) =>
    typeof cell.label === "string" && cell.label.trim().toLowerCase() === label.toLowerCase()
  )?.[0] ?? fallbackId;
}

function cellText(cell: Cell | undefined): string | null {
  if (!cell) return null;
  const instanceText = cell.instances?.find((instance) => typeof instance.text === "string")?.text;
  const text = typeof instanceText === "string"
    ? instanceText
    : typeof cell.text === "string"
      ? cell.text
      : typeof cell.value === "string" || typeof cell.value === "number"
        ? String(cell.value)
        : null;
  return typeof text === "string" && text.trim() !== "" ? text.trim() : null;
}

function cellNumber(cell: Cell | undefined): number | null {
  if (!cell) return null;
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) return cell.value;
  const text = cellText(cell);
  if (!text) return null;
  const match = text.match(/^-?\d+(?:\.\d+)?$/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusFromText(text: string): AcademicRequirementStatus {
  const normalized = text.trim().toLowerCase().replace(/[\s_]+/g, " ");
  if (["satisfied", "complete", "completed"].includes(normalized)) return "satisfied";
  if (["in progress", "in-progress", "inprogress"].includes(normalized)) return "in-progress";
  if (["not satisfied", "not-satisfied", "not complete", "not completed", "incomplete"].includes(normalized)) return "not-satisfied";
  return "unknown";
}

function baseCourseCode(text: string): string | null {
  const match = text.match(COURSE_CODE_RE)?.[1];
  if (!match) return null;
  return match.match(BASE_COURSE_CODE_RE)?.[1] ?? match;
}

function satisfyingRows(row: Row): AcademicProgressResult["requirements"][number]["satisfiedWith"] {
  const registrationCell = row.cellsMap[resolveCellId(row, "Registrations Used", "314.1")];
  const registrationText = cellText(registrationCell);
  if (!registrationText) return [];
  const code = baseCourseCode(registrationText);
  if (!code) return [];
  const period = cellText(row.cellsMap[resolveCellId(row, "Academic Period", "314.2")]);
  return [{
    code,
    text: registrationText,
    academicPeriod: period,
    creditHours: cellNumber(row.cellsMap[resolveCellId(row, "Credit Hours", "314.3")]),
  }];
}

function requirementGrid(candidates: GridCandidate[]): GridCandidate | undefined {
  return candidates.find((candidate) => {
    if (!isPlainObject(candidate.node) || !Array.isArray(candidate.node.columns)) return false;
    return candidate.node.columns.some((column) => isPlainObject(column) && (column.label === "Requirement" || String(column.columnId) === "320.1"));
  });
}

function overallGrid(candidates: GridCandidate[]): GridCandidate | undefined {
  return candidates.find((candidate) => isPlainObject(candidate.node) && candidate.node.label === "Overall Academic Progress");
}

function parseOverall(candidate: GridCandidate): AcademicProgressResult["overall"] {
  const grid = parseGrid(candidate);
  const row = grid.rows[0];
  if (!row) shapeError("Overall academic progress grid has no rows", `${candidate.path}.rows`);
  const columns = {
    defined: resolveColumnId(grid, "Credit Hours Defined", "168.3"),
    inProgress: resolveColumnId(grid, "Credit Hours in Progress", "168.4"),
    satisfying: resolveColumnId(grid, "Credit Hours Satisfying", "168.5"),
    remaining: resolveColumnId(grid, "Remaining", "168.6"),
    status: resolveColumnId(grid, "Status", "168.7"),
  };
  if (Object.values(columns).some((column) => column === undefined)) {
    shapeError("Overall academic progress grid is missing required columns", `${candidate.path}.columns`);
  }
  return {
    definedCredits: cellNumber(row.cellsMap[columns.defined!]),
    inProgressCredits: cellNumber(row.cellsMap[columns.inProgress!]),
    satisfyingCredits: cellNumber(row.cellsMap[columns.satisfying!]),
    remainingCredits: cellNumber(row.cellsMap[columns.remaining!]),
    status: cellText(row.cellsMap[columns.status!]),
  };
}

function parseRequirements(candidate: GridCandidate): { requirements: AcademicProgressResult["requirements"]; unrecognizedRows: AcademicProgressResult["unrecognizedRows"] } {
  const grid = parseGrid(candidate);
  const columns = {
    name: resolveColumnId(grid, "Requirement", "320.1"),
    status: resolveColumnId(grid, "Status", "320.2"),
    remaining: resolveColumnId(grid, "Remaining", "320.3"),
  };
  if (Object.values(columns).some((column) => column === undefined)) {
    shapeError("Requirements grid is missing required columns", `${candidate.path}.columns`);
  }
  const requirements: AcademicProgressResult["requirements"] = [];
  const unrecognizedRows: AcademicProgressResult["unrecognizedRows"] = [];
  for (const row of grid.rows) {
    const name = cellText(row.cellsMap[columns.name!]);
    const statusText = cellText(row.cellsMap[columns.status!]);
    if (!name || !statusText) {
      unrecognizedRows.push({ rowIndex: row.rowIndex, reason: !name ? "missing requirement name" : "missing requirement status" });
      continue;
    }
    requirements.push({
      name,
      status: statusFromText(statusText),
      statusText,
      remaining: cellText(row.cellsMap[columns.remaining!]),
      satisfiedWith: satisfyingRows(row),
    });
  }
  return { requirements, unrecognizedRows };
}

export function parseAcademicProgress(json: unknown): AcademicProgressResult {
  const root = z.object({ body: z.record(z.string(), z.unknown()) }).passthrough().safeParse(json);
  if (!root.success) shapeError('Response is missing a "body" object', "body");
  const candidates = findGrids(root.data.body, "body");
  const overallCandidate = overallGrid(candidates);
  const requirementsCandidate = requirementGrid(candidates);
  if (!overallCandidate || !requirementsCandidate) {
    shapeError("Academic progress response is missing its expected grids", "body");
  }
  const parsedRequirements = parseRequirements(requirementsCandidate);
  return {
    overall: parseOverall(overallCandidate),
    ...parsedRequirements,
  };
}


