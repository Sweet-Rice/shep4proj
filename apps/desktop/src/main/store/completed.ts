import { CourseCodeSchema, type CourseCode } from "@jevschedule/shared";
import type { LocalDb } from "./db.js";

/** The student's completed courses, kept on this machine only (US-05). */
export interface CompletedStore {
  /** Every course marked completed, sorted by code. */
  getCompleted(): CourseCode[];
  /** Marks `code` completed or not completed. Setting the current state again is a no-op. */
  setCompleted(code: CourseCode, completed: boolean): void;
}

/** Creates a {@link CompletedStore} backed by `db`, which must already be migrated. */
export function createCompletedStore(db: LocalDb): CompletedStore {
  const selectAll = db.prepare<[], { code: string }>(
    "SELECT code FROM completed_courses ORDER BY code",
  );
  const insert = db.prepare<[string]>(
    "INSERT INTO completed_courses (code) VALUES (?) ON CONFLICT (code) DO NOTHING",
  );
  const remove = db.prepare<[string]>("DELETE FROM completed_courses WHERE code = ?");

  return {
    getCompleted: () => selectAll.all().map((row) => row.code),
    setCompleted(code, completed) {
      const valid = CourseCodeSchema.parse(code);
      if (completed) insert.run(valid);
      else remove.run(valid);
    },
  };
}
