import type { CourseCode } from "./course-code.js";
import type { LetterGrade } from "./grade.js";
import type { PrereqNode } from "./prereq.js";

/** Failure reasons when a prerequisite string cannot be parsed into a tree. */
export type PrereqFailureReason = "empty" | "ambiguous-and-or" | "unrecognized-token";

/** Result of parsing a catalog prerequisite string. */
export type PrereqParseResult =
  | { ok: true; tree: PrereqNode | null; notes: string[] }
  | { ok: false; reason: PrereqFailureReason; detail: string };

/**
 * Leading corequisite phrases detected at the start of a semicolon clause.
 *
 * Serving: CSC 1350, 1253, 1254, 1351, 3304, 4332.
 */
const LEADING_COREQ_REGEX =
  /^(?:credit\s+or\s+registration\s+in|credit\s+or\s+concurrent\s+enrollment\s+in|concurrent\s+enrollment\s+in|registration\s+in)\s+/i;

/**
 * Global pattern to extract min-grade phrases and replace them with placeholder tokens.
 * Handles "C" or better in, grade of "C" or better in, curly quotes, grade of C, etc.
 *
 * Matching variations:
 * - grade of "C" or better in
 * - "C" or better in
 * - “C” or better in
 * - grade of “C” in
 * - grade of "C" in / grade of "C"
 * - C or better in
 */
const MIN_GRADE_GLOBAL_REGEX =
  /(?:grade\s+of\s+["“]?([A-D])["”]?(?:\s+or\s+better)?|["“]([A-D])[”"](?:\s+or\s+better)?|([A-D])\s+or\s+better)(?:\s+in)?\s+/gi;

/**
 * Placeholder token mapping for course modifiers. Replacing these before
 * splitting avoids ambiguous and/or triggers caused by words inside phrases.
 *
 * - Parser extension for CSC 4610, 4740: handle inline "credit or registration in <course>"
 * - Parser extension for CSC 3102: handle inline "credit or concurrent enrollment in <course>"
 * - Parser extension for CSC 1100: handle inline "registration in <course>"
 * - Parser extension for CSC 1100, 1253: handle inline "credit in <course>"
 * - Parser extension for CSC 1240: handle inline "placement in <course>"
 */
const COURSE_MODIFIER_PATTERNS = [
  { regex: /credit\s+or\s+registration\s+in\s+/gi, placeholder: "__COREQ__ " },
  { regex: /credit\s+or\s+concurrent\s+enrollment\s+in\s+/gi, placeholder: "__COREQ__ " },
  { regex: /concurrent\s+enrollment\s+in\s+/gi, placeholder: "__COREQ__ " },
  { regex: /registration\s+in\s+/gi, placeholder: "__COREQ__ " },
  { regex: /credit\s+in\s+/gi, placeholder: "__CREDIT__ " },
  { regex: /placement\s+in\s+/gi, placeholder: "__PLACEMENT__ " },
];

/**
 * Non-course requirement phrases captured into notes and dropped from the tree.
 *
 * - Base grammar: permission/consent of (the )?(department|instructor|chair|dean),
 *   equivalent, standing, majors only
 * - Non-course extension for CSC 3999, 4999: "consent of department chair"
 * - Non-course extension for CSC 2700, 3700, 4700, 7090, 7999, 8000, 9000: "permission of department" / "consent of department"
 * - Non-course extension for CSC 7600: "consent of instructor"
 * - Non-course extension for CSC 2463, 4263, 4512: "permission of instructor"
 * - Non-course extension for CSC 3991, 3992: "admittance to Upper Division Honors Program"
 * - Non-course extension for CSC 4243: "equivalent programming background"
 * - Non-course extension for CSC 2362, 4351, 4360, 4362, 4762, 7150, 7351, 7360, 7443, 7481, 7510: "equivalent" / "or equivalent"
 */
const NON_COURSE_REGEX =
  /^(?:(?:or\s+)?(?:permission|consent|approval)\s+of\s+(?:the\s+)?(?:department(?:\s+chair)?|instructor|chair|dean)|(?:or\s+)?equivalent(?:\s+programming\s+background)?|(?:freshman|sophomore|junior|senior|graduate)\s+standing|majors\s+only|admittance\s+to\s+upper\s+division\s+honors\s+program)$/i;

/** Course code pattern: 2 to 4 uppercase letters, space, 4 digits. */
const COURSE_CODE_REGEX = /^([A-Z]{2,4}\s+\d{4})$/;

/**
 * Flattens nested same-type boolean operator nodes.
 *
 * For instance, an AND node whose child is an AND node is flattened into a
 * single AND node with all children combined.
 */
function flattenTree(node: PrereqNode | null): PrereqNode | null {
  if (!node || node.type === "COURSE") {
    return node;
  }

  const flattenedChildren: PrereqNode[] = [];
  for (const child of node.children) {
    const flattenedChild = flattenTree(child);
    if (!flattenedChild) continue;

    if (flattenedChild.type === node.type) {
      flattenedChildren.push(...flattenedChild.children);
    } else {
      flattenedChildren.push(flattenedChild);
    }
  }

  if (flattenedChildren.length === 1) {
    return flattenedChildren[0]!;
  }

  return {
    ...node,
    children: flattenedChildren,
  };
}

/**
 * Parses a catalog prerequisite string into a {@link PrereqNode} expression tree.
 *
 * This function never throws; all runtime errors are captured and returned as
 * failure results with reason `"unrecognized-token"`.
 */
export function parsePrereqText(text: string): PrereqParseResult {
  try {
    // 1. Collapse whitespace, trim, and strip one trailing '.'
    const collapsed = text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
    if (!collapsed) {
      return { ok: false, reason: "empty", detail: "prerequisite text is empty" };
    }

    // 2. Split on ';' into groups
    const rawGroups = collapsed
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    const notes: string[] = [];
    const groupTrees: PrereqNode[] = [];

    for (const groupStr of rawGroups) {
      let clause = groupStr;
      let groupCoreq = false;

      // 3.1 Detect leading coreq phrase
      const leadingMatch = clause.match(LEADING_COREQ_REGEX);
      if (leadingMatch) {
        groupCoreq = true;
        clause = clause.slice(leadingMatch[0].length).trim();
      }

      // 3.2 Extract min-grade phrases by replacing them with placeholder tokens
      clause = clause.replace(MIN_GRADE_GLOBAL_REGEX, (_, g1, g2, g3) => {
        const grade = (g1 || g2 || g3).toUpperCase();
        return `__MINGRADE_${grade}__ `;
      });

      // Replace inline coreq / credit / placement phrases with placeholder tokens
      for (const { regex, placeholder } of COURSE_MODIFIER_PATTERNS) {
        regex.lastIndex = 0;
        clause = clause.replace(regex, placeholder);
      }

      // 3.3 Check if remainder contains both \band\b and \bor\b -> ambiguous-and-or
      if (/\band\b/i.test(clause) && /\bor\b/i.test(clause)) {
        return { ok: false, reason: "ambiguous-and-or", detail: groupStr };
      }

      const isOrGroup = /\bor\b/i.test(clause);

      // 3.4 Split alternatives on \bor\b (OR) or items on , / \band\b (AND)
      let items: string[];
      if (isOrGroup) {
        // Commas followed by or (like "A, or B", "A,or B") or plain "or" or comma in list
        items = clause.split(/\s*,\s*or\s+|\s*,or\s+|\s+or\s+|\s*,\s*/i);
      } else {
        // Items on comma or "and"
        items = clause.split(/\s*,\s*and\s+|\s*,and\s+|\s+and\s+|\s*,\s*/i);
      }

      // 3.5 Process each item
      const courseNodes: PrereqNode[] = [];
      for (const rawItem of items) {
        let item = rawItem.trim();
        if (!item) continue;

        // Check non-course phrase before stripping placeholders
        if (NON_COURSE_REGEX.test(item)) {
          notes.push(item);
          continue;
        }

        let itemCoreq = groupCoreq;
        let minGrade: LetterGrade | null = null;

        // Extract min grade placeholder
        const mgMatch = item.match(/^__MINGRADE_([A-D])__\s*/);
        if (mgMatch) {
          minGrade = mgMatch[1] as LetterGrade;
          item = item.slice(mgMatch[0].length).trim();
        }

        // Extract coreq / credit / placement placeholders
        if (item.startsWith("__COREQ__")) {
          itemCoreq = true;
          item = item.slice("__COREQ__".length).trim();
        } else if (item.startsWith("__CREDIT__")) {
          itemCoreq = false;
          item = item.slice("__CREDIT__".length).trim();
        } else if (item.startsWith("__PLACEMENT__")) {
          // Placement in a course satisfies prereq; coreq status defaults to false
          itemCoreq = false;
          item = item.slice("__PLACEMENT__".length).trim();
        }

        // Check course code
        const courseMatch = item.match(COURSE_CODE_REGEX);
        if (courseMatch) {
          courseNodes.push({
            type: "COURSE",
            code: courseMatch[1] as CourseCode,
            coreq: itemCoreq,
            minGrade,
          });
        } else if (NON_COURSE_REGEX.test(item)) {
          notes.push(item);
        } else {
          return { ok: false, reason: "unrecognized-token", detail: rawItem.trim() };
        }
      }

      // Normalize group: collapse 1 child, or construct AND/OR with >= 2 children
      if (courseNodes.length === 1) {
        groupTrees.push(courseNodes[0]!);
      } else if (courseNodes.length > 1) {
        groupTrees.push({
          type: isOrGroup ? "OR" : "AND",
          children: courseNodes,
        });
      }
    }

    // 4. Combine group trees into root tree
    let rootTree: PrereqNode | null = null;
    if (groupTrees.length === 1) {
      rootTree = groupTrees[0]!;
    } else if (groupTrees.length > 1) {
      rootTree = {
        type: "AND",
        children: groupTrees,
      };
    }

    // Flatten nested same-type nodes
    rootTree = flattenTree(rootTree);

    return {
      ok: true,
      tree: rootTree,
      notes,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "unrecognized-token",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
