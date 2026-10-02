import type { AcademicProgressResult } from "@jevschedule/workday/academic-progress";
import type { LocalDb } from "./db.js";

export interface StoredAcademicProgress {
  importedAt: string;
  result: AcademicProgressResult;
}

export interface AcademicProgressStore {
  getAudit(): StoredAcademicProgress | null;
  saveAudit(result: AcademicProgressResult, importedAt?: string): void;
}

export function createAcademicProgressStore(db: LocalDb): AcademicProgressStore {
  const select = db.prepare<[], { imported_at: string; result_json: string }>(
    "SELECT imported_at, result_json FROM academic_progress_audit WHERE id = 1",
  );
  const upsert = db.prepare<[string, string]>(
    `INSERT INTO academic_progress_audit (id, imported_at, result_json)
     VALUES (1, ?, ?)
     ON CONFLICT (id) DO UPDATE SET imported_at = excluded.imported_at, result_json = excluded.result_json`,
  );

  return {
    getAudit() {
      const row = select.get();
      return row
        ? {
            importedAt: row.imported_at,
            result: JSON.parse(row.result_json) as AcademicProgressResult,
          }
        : null;
    },
    saveAudit(result, importedAt = new Date().toISOString()) {
      upsert.run(importedAt, JSON.stringify(result));
    },
  };
}
