import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getTestDatabaseUrl, truncateSections } from "../test-support/db.js";
import { createDb, type Db } from "./client.js";
import { meetings, sections, type NewSectionRow } from "./schema.js";

const lecture: NewSectionRow = {
  term: "LSUAM_FALL_2026",
  courseCode: "CSC 4330",
  sectionNumber: "001",
  sectionType: "LEC",
  creditsMin: 3,
  creditsMax: 3,
  instructor: "David C. Shepherd",
  location: "1206 Patrick F. Taylor Hall",
  deliveryMode: "On Campus",
  enrollment: 78,
  capacity: 78,
};

describe.skipIf(!getTestDatabaseUrl())("sections and meetings tables", () => {
  let db: Db;
  let closeDb: () => Promise<void>;

  beforeAll(() => {
    const dbUrl = getTestDatabaseUrl();
    if (!dbUrl) throw new Error("DATABASE_URL is required for integration tests");
    ({ db, close: closeDb } = createDb(dbUrl));
  });

  beforeEach(async () => {
    await truncateSections(db);
  });

  afterAll(async () => {
    await closeDb?.();
  });

  it("round-trips a section with its meetings", async () => {
    const [inserted] = await db.insert(sections).values(lecture).returning();
    if (!inserted) throw new Error("insert returned no row");
    await db.insert(meetings).values([
      { sectionId: inserted.id, days: ["Tue", "Thu"], startMinute: 900, endMinute: 980 },
      { sectionId: inserted.id, days: ["Fri"], startMinute: 600, endMinute: 650 },
    ]);

    const [row] = await db.select().from(sections).where(eq(sections.id, inserted.id));
    expect(row).toMatchObject({ ...lecture, creditsNote: null });
    const saved = await db
      .select({ days: meetings.days, startMinute: meetings.startMinute })
      .from(meetings)
      .where(eq(meetings.sectionId, inserted.id))
      .orderBy(meetings.startMinute);
    expect(saved).toEqual([
      { days: ["Fri"], startMinute: 600 },
      { days: ["Tue", "Thu"], startMinute: 900 },
    ]);
  });

  it("keeps blank portal fields as null", async () => {
    const [row] = await db
      .insert(sections)
      .values({
        ...lecture,
        courseCode: "CSC 4999G",
        sectionType: "RES",
        instructor: null,
        location: null,
      })
      .returning();
    expect(row).toMatchObject({ courseCode: "CSC 4999G", instructor: null, location: null });
  });

  it("allows the same number with a different type, but not an exact duplicate", async () => {
    await db.insert(sections).values(lecture);
    await db.insert(sections).values({ ...lecture, sectionType: "LAB" });
    await expect(db.insert(sections).values(lecture)).rejects.toThrow();
  });

  it("deletes a section's meetings with it", async () => {
    const [inserted] = await db.insert(sections).values(lecture).returning();
    if (!inserted) throw new Error("insert returned no row");
    await db
      .insert(meetings)
      .values({ sectionId: inserted.id, days: ["Mon"], startMinute: 480, endMinute: 530 });

    await db.delete(sections).where(eq(sections.id, inserted.id));
    expect(await db.select().from(meetings)).toEqual([]);
  });
});
