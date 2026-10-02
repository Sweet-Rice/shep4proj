import type { LocalDb } from "./db.js";

export interface LocalWatch {
  id: string;
  term: string;
  courseCode: string;
  sectionNumber: string;
  sectionType: string;
  lastNotifiedAt: string | null;
}

export type NewLocalWatch = Omit<LocalWatch, "lastNotifiedAt">;

export interface WatchStore {
  list(): LocalWatch[];
  add(watch: NewLocalWatch): void;
  remove(id: string): void;
  markNotified(id: string, iso: string): void;
}

/** Keeps the watch bearer IDs and notification checkpoints on this device only. */
export function createWatchStore(db: LocalDb): WatchStore {
  const listRows = db.prepare<[], LocalWatch>(
    `SELECT id, term, course_code AS courseCode, section_number AS sectionNumber,
            section_type AS sectionType, last_notified_at AS lastNotifiedAt
     FROM section_watches ORDER BY rowid`,
  );
  const insert = db.prepare<[string, string, string, string, string]>(
    `INSERT INTO section_watches (id, term, course_code, section_number, section_type)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const deleteById = db.prepare<[string]>("DELETE FROM section_watches WHERE id = ?");
  const updateNotified = db.prepare<[string, string]>(
    "UPDATE section_watches SET last_notified_at = ? WHERE id = ?",
  );

  return {
    list: () => listRows.all(),
    add: (watch) => {
      insert.run(watch.id, watch.term, watch.courseCode, watch.sectionNumber, watch.sectionType);
    },
    remove: (id) => {
      deleteById.run(id);
    },
    markNotified: (id, iso) => {
      updateNotified.run(iso, id);
    },
  };
}
