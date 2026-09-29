import { DEFAULT_CREDIT_LIMIT, PlanSchema, type Plan, type Season } from "@jevschedule/shared";
import type { LocalDb } from "./db.js";

/** The student's semester-by-semester plan (US-08), kept on this machine only. */
export interface PlanStore {
  /**
   * The saved plan, terms and courses in the order they were saved. Empty, with the default
   * credit limit, if nothing has been saved yet.
   */
  getPlan(): Plan;
  /** Replaces the saved plan with `plan`, all or nothing. */
  savePlan(plan: Plan): void;
}

interface TermRow {
  id: number;
  season: Season;
  year: number;
}

interface CourseRow {
  termId: number;
  code: string;
}

/** Creates a {@link PlanStore} backed by `db`, which must already be migrated. */
export function createPlanStore(db: LocalDb): PlanStore {
  const selectTerms = db.prepare<[], TermRow>(
    "SELECT id, season, year FROM plan_terms ORDER BY position",
  );
  const selectCourses = db.prepare<[], CourseRow>(
    "SELECT term_id AS termId, code FROM plan_courses ORDER BY term_id, position",
  );
  const selectCreditLimit = db.prepare<[], { creditLimit: number }>(
    "SELECT credit_limit AS creditLimit FROM plan_settings WHERE id = 1",
  );
  const upsertCreditLimit = db.prepare<[number]>(
    `INSERT INTO plan_settings (id, credit_limit) VALUES (1, ?)
     ON CONFLICT (id) DO UPDATE SET credit_limit = excluded.credit_limit`,
  );
  const deleteTerms = db.prepare("DELETE FROM plan_terms");
  const insertTerm = db.prepare<[number, string, number]>(
    "INSERT INTO plan_terms (position, season, year) VALUES (?, ?, ?)",
  );
  const insertCourse = db.prepare<[number | bigint, number, string]>(
    "INSERT INTO plan_courses (term_id, position, code) VALUES (?, ?, ?)",
  );

  // Deleting the terms cascades to their courses, so a save always starts from empty.
  const replacePlan = db.transaction((plan: Plan) => {
    upsertCreditLimit.run(plan.creditLimit);
    deleteTerms.run();
    plan.terms.forEach((term, termPosition) => {
      const { lastInsertRowid } = insertTerm.run(termPosition, term.season, term.year);
      term.courses.forEach((code, coursePosition) => {
        insertCourse.run(lastInsertRowid, coursePosition, code);
      });
    });
  });

  return {
    getPlan() {
      const coursesByTerm = new Map<number, string[]>();
      for (const { termId, code } of selectCourses.all()) {
        const courses = coursesByTerm.get(termId) ?? [];
        courses.push(code);
        coursesByTerm.set(termId, courses);
      }
      return {
        creditLimit: selectCreditLimit.get()?.creditLimit ?? DEFAULT_CREDIT_LIMIT,
        terms: selectTerms.all().map(({ id, season, year }) => ({
          season,
          year,
          courses: coursesByTerm.get(id) ?? [],
        })),
      };
    },
    savePlan(plan) {
      replacePlan(PlanSchema.parse(plan));
    },
  };
}
