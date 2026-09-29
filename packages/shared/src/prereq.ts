import { z } from "zod";
import { CourseCodeSchema, type CourseCode } from "./course-code.js";
import { LetterGradeSchema, type LetterGrade } from "./grade.js";

/**
 * A prerequisite / corequisite expression tree for one course.
 *
 * Interior nodes combine their children with a boolean operator; leaves name a
 * single course. Requirements that reference no course (e.g. "junior standing")
 * are not representable in this tree.
 */
export type PrereqNode =
  /**
   * Satisfied only when every child is satisfied. Always has at least two
   * children; a single requirement is represented by the child itself.
   */
  | { type: "AND"; children: PrereqNode[] }
  /**
   * Satisfied when at least one child is satisfied. Always has at least two
   * children; a single requirement is represented by the child itself.
   */
  | { type: "OR"; children: PrereqNode[] }
  /** A single required course. */
  | {
      type: "COURSE";
      /** Catalog code of the required course (e.g. "CSC 3102"). */
      code: CourseCode;
      /**
       * When true the course may be taken in the same term as the course that
       * requires it ("credit or registration in", "credit or concurrent
       * enrollment in"); when false it must be completed in an earlier term.
       */
      coreq: boolean;
      /**
       * Minimum letter grade that satisfies the requirement, or null when any
       * passing grade counts.
       */
      minGrade: LetterGrade | null;
    };

/** Zod schema for {@link PrereqNode}; AND and OR nodes must have at least two children. */
export const PrereqNodeSchema: z.ZodType<PrereqNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("AND"), children: z.array(PrereqNodeSchema).min(2) }),
    z.object({ type: z.literal("OR"), children: z.array(PrereqNodeSchema).min(2) }),
    z.object({
      type: z.literal("COURSE"),
      code: CourseCodeSchema,
      coreq: z.boolean(),
      minGrade: LetterGradeSchema.nullable(),
    }),
  ]),
);
