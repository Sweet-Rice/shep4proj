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
 * Returns unmet course leaves that are required through AND nodes. OR subtrees
 * are skipped because this prompt cannot choose which alternative was taken.
 */
export function getRequiredUnmetPrereqs(
  tree: PrereqNode | null,
  completed: ReadonlySet<CourseCode>,
): CourseCode[] {
  const required: CourseCode[] = [];
  const seen = new Set<CourseCode>();

  function visit(node: PrereqNode): void {
    if (node.type === "OR") return;
    if (node.type === "COURSE") {
      if (!completed.has(node.code) && !seen.has(node.code)) {
        seen.add(node.code);
        required.push(node.code);
      }
      return;
    }
    for (const child of node.children) visit(child);
  }

  if (tree) visit(tree);
  return required;
}
