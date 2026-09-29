import { sql } from "drizzle-orm";
import { courses, type NewCourseRow } from "../db/schema.js";
import type { Db } from "../db/client.js";

export async function upsertCourses(db: Db, rows: NewCourseRow[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  const result = await db
    .insert(courses)
    .values(rows)
    .onConflictDoUpdate({
      target: [courses.catalogYear, courses.code],
      set: {
        dept: sql`excluded.dept`,
        title: sql`excluded.title`,
        creditsMin: sql`excluded.credits_min`,
        creditsMax: sql`excluded.credits_max`,
        creditsNote: sql`excluded.credits_note`,
        description: sql`excluded.description`,
        prerequisiteText: sql`excluded.prerequisite_text`,
        prereqTree: sql`excluded.prereq_tree`,
        prereqNeedsReview: sql`excluded.prereq_needs_review`,
        prereqReviewReason: sql`excluded.prereq_review_reason`,
        prereqNotes: sql`excluded.prereq_notes`,
        coid: sql`excluded.coid`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: courses.id });

  return result.length;
}
