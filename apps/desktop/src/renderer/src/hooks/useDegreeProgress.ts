import { useMemo } from "react";
import {
  type CourseCode,
  type DegreeEvaluation,
  type DegreeProgram,
  type Course,
} from "@jevschedule/shared";
import { plannerTools } from "../services/plannerTools.js";

/**
 * Custom hook that evaluates degree requirements against completed courses.
 * Immediately recomputes whenever degree program or completed courses change.
 */
export function useDegreeProgress(
  degree: DegreeProgram | null,
  completed: Set<CourseCode> | CourseCode[],
  catalog?: Map<CourseCode, Course> | Course[],
): DegreeEvaluation | null {
  return useMemo(() => {
    if (!degree) return null;
    return plannerTools.getRemainingRequirements(degree, completed, catalog);
  }, [degree, completed, catalog]);
}
