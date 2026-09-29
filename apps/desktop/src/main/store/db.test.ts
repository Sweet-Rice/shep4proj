import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDbVersionError, MIGRATIONS, migrate, openLocalDb, type LocalDb } from "./db.js";

const userVersion = (db: LocalDb) => db.pragma("user_version", { simple: true });

describe("openLocalDb", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("migrates a new database to the latest schema version", () => {
    const db = openLocalDb(":memory:");
    expect(userVersion(db)).toBe(MIGRATIONS.length);
    db.close();
  });

  it("reopens an existing database file without re-running migrations", () => {
    const dir = mkdtempSync(join(tmpdir(), "jevschedule-db-"));
    dirs.push(dir);
    const file = join(dir, "local.sqlite");

    openLocalDb(file).close();
    const db = openLocalDb(file);
    expect(userVersion(db)).toBe(MIGRATIONS.length);
    db.close();
  });

  it("refuses a database written by a newer app version", () => {
    const dir = mkdtempSync(join(tmpdir(), "jevschedule-db-"));
    dirs.push(dir);
    const file = join(dir, "local.sqlite");
    const newer = openLocalDb(file);
    newer.pragma(`user_version = ${MIGRATIONS.length + 1}`);
    newer.close();

    expect(() => openLocalDb(file)).toThrow(LocalDbVersionError);
  });
});

describe("migrate", () => {
  it("applies only migrations past the current version", () => {
    const db = openLocalDb(":memory:");
    migrate(db, [...MIGRATIONS, "CREATE TABLE extra (id INTEGER) STRICT"]);
    expect(userVersion(db)).toBe(MIGRATIONS.length + 1);
    db.close();
  });

  it("rolls back every migration in the batch when one fails", () => {
    const db = openLocalDb(":memory:");
    expect(() =>
      migrate(db, [...MIGRATIONS, "CREATE TABLE extra (id INTEGER) STRICT", "NOT SQL"]),
    ).toThrow();
    expect(userVersion(db)).toBe(MIGRATIONS.length);
    const extra = db.prepare("SELECT name FROM sqlite_master WHERE name = 'extra'").get();
    expect(extra).toBeUndefined();
    db.close();
  });
});
