import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";

export function getTestDatabaseUrl(): string | undefined {
  return process.env["DATABASE_URL"];
}

export async function truncateCourses(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE courses RESTART IDENTITY`);
}

export async function truncateSections(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE sections, meetings, section_scrapes RESTART IDENTITY`);
}

export async function truncateSectionArchive(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE section_archive`);
}

export async function truncateWatches(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE watches`);
}
