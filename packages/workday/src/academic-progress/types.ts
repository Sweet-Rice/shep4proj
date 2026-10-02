import { WorkdayShapeError } from "../academic-record/types.ts";

export type AcademicRequirementStatus = "satisfied" | "in-progress" | "not-satisfied" | "unknown";

export interface AcademicProgressResult {
  overall: {
    definedCredits: number | null;
    inProgressCredits: number | null;
    satisfyingCredits: number | null;
    remainingCredits: number | null;
    status: string | null;
  };
  requirements: {
    name: string;
    status: AcademicRequirementStatus;
    statusText: string;
    remaining: string | null;
    satisfiedWith: {
      code: string | null;
      text: string;
      academicPeriod: string | null;
      creditHours: number | null;
    }[];
  }[];
  unrecognizedRows: { rowIndex: number; reason: string }[];
}

export { WorkdayShapeError };
