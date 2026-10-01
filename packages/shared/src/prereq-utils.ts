import type { CourseCode } from "./course-code.js";
import type { PrereqNode } from "./prereq.js";

/**
 * Collects all course codes referenced in a prerequisite tree.
 */
export function collectPrereqCourseCodes(node: PrereqNode | null | undefined): CourseCode[] {
  if (!node) return [];

  if (node.type === "COURSE") {
    return [node.code];
  }

  const codes = new Set<CourseCode>();
  for (const child of node.children) {
    for (const code of collectPrereqCourseCodes(child)) {
      codes.add(code);
    }
  }

  return Array.from(codes);
}

/**
 * Returns the list of unfulfilled prerequisite course codes required for a course,
 * excluding any courses that are already completed or the course itself.
 */
export function getUnfulfilledPrereqs(
  prereqMapOrNode:
    | Record<CourseCode, CourseCode[] | PrereqNode | null>
    | PrereqNode
    | CourseCode[]
    | null
    | undefined,
  courseCode: CourseCode,
  completed: Set<CourseCode> | CourseCode[],
): CourseCode[] {
  const completedSet = completed instanceof Set ? completed : new Set(completed);
  let prereqCodes: CourseCode[] = [];

  if (!prereqMapOrNode) return [];

  if (Array.isArray(prereqMapOrNode)) {
    prereqCodes = prereqMapOrNode;
  } else if (typeof prereqMapOrNode === "object" && "type" in prereqMapOrNode) {
    prereqCodes = collectPrereqCourseCodes(prereqMapOrNode as PrereqNode);
  } else {
    const entry = (prereqMapOrNode as Record<CourseCode, CourseCode[] | PrereqNode | null>)[
      courseCode
    ];
    if (!entry) return [];
    if (Array.isArray(entry)) {
      prereqCodes = entry;
    } else if (typeof entry === "object" && "type" in entry) {
      prereqCodes = collectPrereqCourseCodes(entry as PrereqNode);
    }
  }

  return prereqCodes.filter((code) => code !== courseCode && !completedSet.has(code));
}
