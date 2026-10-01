import type { CourseCode } from "./course-code.js";
import type { CompletedInput } from "./evaluate-requirements.js";
import type { LetterGrade } from "./grade.js";
import type { PrereqNode } from "./prereq.js";

/** The parsed prerequisite fields returned with a course detail. */
export interface EligibilityCourse {
  code: CourseCode;
  prereq: {
    tree: PrereqNode | null;
    needsReview: boolean;
  };
}

export interface EligibilityResult {
  /** Null means the prerequisite text needs a human decision. */
  eligible: boolean | null;
  status: "eligible" | "ineligible" | "needs_review";
  /** Requirements that still need to be met, including alternatives for an OR branch. */
  missingPrerequisites: string[];
  warning?: string;
}

const GRADE_RANK: Record<LetterGrade, number> = { A: 4, B: 3, C: 2, D: 1 };

function missingForNode(
  node: PrereqNode,
  completed: Map<CourseCode, LetterGrade | null>,
  plannedSameTerm: ReadonlySet<CourseCode>,
): string[] {
  if (node.type === "AND") {
    return node.children.flatMap((child) => missingForNode(child, completed, plannedSameTerm));
  }

  if (node.type === "OR") {
    const alternatives = node.children.map((child) =>
      missingForNode(child, completed, plannedSameTerm),
    );
    if (alternatives.some((missing) => missing.length === 0)) return [];
    return [`One of: ${alternatives.map((missing) => missing.join(" and ")).join("; or ")}`];
  }

  const grade = completed.get(node.code);
  if (completed.has(node.code)) {
    if (node.minGrade === null) return [];
    if (grade !== null && grade !== undefined && GRADE_RANK[grade] >= GRADE_RANK[node.minGrade]) {
      return [];
    }
    return [`${node.code} with a recorded grade of ${node.minGrade} or better`];
  }
  if (node.coreq && plannedSameTerm.has(node.code)) return [];
  return [
    node.coreq
      ? `${node.code} completed or planned in the same term`
      : `${node.code} completed${node.minGrade === null ? "" : ` with grade ${node.minGrade} or better`}`,
  ];
}

/**
 * Checks the parsed AND/OR prerequisite tree. A same-term course counts only
 * for a leaf marked as a corequisite. Unknown grades cannot prove a minimum
 * grade, and unreviewed prerequisite text is never treated as an empty tree.
 */
export function isEligible(
  course: EligibilityCourse,
  completed: CompletedInput[] | Set<CourseCode>,
  plannedSameTerm: ReadonlySet<CourseCode> | readonly CourseCode[],
): EligibilityResult {
  if (course.prereq.needsReview) {
    return {
      eligible: null,
      status: "needs_review",
      missingPrerequisites: [],
      warning: "Prerequisites need manual review; check the catalog before enrolling.",
    };
  }
  if (course.prereq.tree === null) {
    return { eligible: true, status: "eligible", missingPrerequisites: [] };
  }

  const grades = new Map<CourseCode, LetterGrade | null>();
  for (const item of completed) {
    const code = typeof item === "string" ? item : item.code;
    const grade = typeof item === "string" ? null : (item.grade ?? null);
    const previous = grades.get(code);
    if (
      !grades.has(code) ||
      previous === null ||
      (grade !== null && previous !== undefined && GRADE_RANK[grade] > GRADE_RANK[previous])
    ) {
      grades.set(code, grade);
    }
  }
  const planned = plannedSameTerm instanceof Set ? plannedSameTerm : new Set(plannedSameTerm);
  const missingPrerequisites = missingForNode(course.prereq.tree, grades, planned);
  return {
    eligible: missingPrerequisites.length === 0,
    status: missingPrerequisites.length === 0 ? "eligible" : "ineligible",
    missingPrerequisites,
  };
}
