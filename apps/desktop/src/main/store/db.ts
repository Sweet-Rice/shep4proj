import Database from "better-sqlite3";

/** Handle to the desktop app's local SQLite database (main process only, see T-201). */
export type LocalDb = Database.Database;

/**
 * Schema migrations, applied in order. The database's `user_version` pragma records how
 * many have run, so a migration's position is its version and must never change once
 * shipped: append new migrations, never edit or reorder existing ones.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE completed_courses (
     code TEXT PRIMARY KEY NOT NULL
   ) STRICT`,
];

/** Thrown when the database was written by a newer app version than this one. */
export class LocalDbVersionError extends Error {
  constructor(
    readonly dbVersion: number,
    readonly appVersion: number,
  ) {
    super(`local database is at schema version ${dbVersion}, newer than this app's ${appVersion}`);
    this.name = "LocalDbVersionError";
  }
}

/**
 * Opens (creating if needed) the local database at `filename` and brings its schema up to
 * date. Pass `":memory:"` for a throwaway database in tests.
 */
export function openLocalDb(filename: string): LocalDb {
  const db = new Database(filename);
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db, MIGRATIONS);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Runs every migration past the database's current `user_version` in one transaction, so a
 * failure leaves the schema exactly as it was.
 */
export function migrate(db: LocalDb, migrations: readonly string[]): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current > migrations.length) throw new LocalDbVersionError(current, migrations.length);
  if (current === migrations.length) return;

  db.transaction(() => {
    for (const sql of migrations.slice(current)) db.exec(sql);
    db.pragma(`user_version = ${migrations.length}`);
  })();
}
