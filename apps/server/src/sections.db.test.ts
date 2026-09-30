import type { FastifyInstance } from "fastify";
import type { Section } from "@jevschedule/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import { createDb, type Db } from "./db/client.js";
import type { SectionsResponse } from "./routes/sections.js";
import { SECTION_FIXTURE_PERIOD, seedSectionFixtures } from "./sections/seed.js";
import { replaceTermSections } from "./sections/store.js";
import { getTestDatabaseUrl, truncateSections } from "./test-support/db.js";

const OTHER_TERM = "LSUAM_SPRING_2027";

describe.skipIf(!getTestDatabaseUrl())("sections routes", () => {
  let app: FastifyInstance;
  let db: Db;
  let closeDb: () => Promise<void>;

  const get = async (url: string) => {
    const res = await app.inject({ method: "GET", url });
    return { status: res.statusCode, body: res.json<SectionsResponse & { error?: string }>() };
  };

  beforeAll(async () => {
    const dbUrl = getTestDatabaseUrl();
    if (!dbUrl) throw new Error("DATABASE_URL is required for integration tests");
    ({ db, close: closeDb } = createDb(dbUrl));

    await truncateSections(db);
    await seedSectionFixtures(db);
    // A second term, so the term filter has something to filter out.
    const spring: Section = {
      term: OTHER_TERM,
      courseCode: "CSC 4330",
      sectionNumber: "001",
      sectionType: "LEC",
      credits: { min: 3, max: 3, note: null },
      instructor: null,
      location: null,
      deliveryMode: "On Campus",
      enrollment: 0,
      capacity: 80,
      meetings: [{ days: ["Mon", "Wed"], startMinute: 630, endMinute: 710 }],
    };
    await replaceTermSections(db, {
      department: "CSC",
      term: OTHER_TERM,
      sections: [spring],
      scrapedAt: new Date(),
    });

    app = buildServer({ db });
  });

  afterAll(async () => {
    await app?.close();
    await closeDb?.();
  });

  it("returns a course's sections for a term, with meetings, in section order", async () => {
    const { status, body } = await get(`/sections?course=CSC-4330&term=${SECTION_FIXTURE_PERIOD}`);
    expect(status).toBe(200);
    expect(body.sections).toEqual([
      {
        term: SECTION_FIXTURE_PERIOD,
        courseCode: "CSC 4330",
        sectionNumber: "001",
        sectionType: "LEC",
        credits: { min: 3, max: 3, note: null },
        instructor: "David C. Shepherd",
        location: "1206 Patrick F. Taylor Hall",
        deliveryMode: "On Campus",
        enrollment: 78,
        capacity: 78,
        meetings: [{ days: ["Tue", "Thu"], startMinute: 900, endMinute: 980 }],
      },
      expect.objectContaining({
        sectionNumber: "002",
        instructor: "Anas Mahmoud",
        enrollment: 66,
        capacity: 65,
      }),
    ]);
  });

  it("returns every stored term when term is omitted", async () => {
    const { status, body } = await get("/sections?course=CSC-4330");
    expect(status).toBe(200);
    expect(body.sections.map((s) => `${s.term} ${s.sectionNumber}`)).toEqual([
      `${SECTION_FIXTURE_PERIOD} 001`,
      `${SECTION_FIXTURE_PERIOD} 002`,
      `${OTHER_TERM} 001`,
    ]);
  });

  it("keeps lecture and lab sections with the same number apart", async () => {
    const { body } = await get(`/sections?course=CSC-1350&term=${SECTION_FIXTURE_PERIOD}`);
    expect(
      body.sections.map(({ sectionNumber, sectionType }) => [sectionNumber, sectionType]),
    ).toEqual([
      ["001", "LAB"],
      ["001", "LEC"],
      ["002", "LAB"],
      ["002", "LEC"],
    ]);
    const labs = body.sections.filter((s) => s.sectionType === "LAB");
    expect(labs.length).toBeGreaterThan(0);
    expect(labs[0]).toMatchObject({ instructor: null, credits: { min: 0, max: 0, note: null } });
    expect(body.sections.some((s) => s.sectionType === "LEC")).toBe(true);
  });

  it("returns sections without meeting times with an empty meetings list", async () => {
    const { body } = await get(`/sections?course=CSC-1110&term=${SECTION_FIXTURE_PERIOD}`);
    expect(body.sections).toEqual([
      expect.objectContaining({ sectionNumber: "001", deliveryMode: "Web-Based", meetings: [] }),
      expect.objectContaining({ sectionNumber: "212", deliveryMode: "On Campus", meetings: [] }),
    ]);
  });

  it("accepts lowercase and suffixed course codes", async () => {
    const lower = await get(`/sections?course=csc-4330&term=${SECTION_FIXTURE_PERIOD}`);
    expect(lower.body.sections).toHaveLength(2);
    const graduate = await get(`/sections?course=CSC-4330G&term=${SECTION_FIXTURE_PERIOD}`);
    expect(graduate.status).toBe(200);
    expect(graduate.body.sections.every((s) => s.courseCode === "CSC 4330G")).toBe(true);
    expect(graduate.body.sections.length).toBeGreaterThan(0);
  });

  it.each(["/sections?course=CSC-9999", `/sections?course=CSC-4330&term=LSUAM_SUMMER_2031`])(
    "returns an empty list for %s",
    async (url) => {
      expect(await get(url)).toEqual({ status: 200, body: { sections: [] } });
    },
  );

  it.each([
    ["no course", "/sections"],
    ["a space-separated course", "/sections?course=CSC%204330"],
    ["a malformed course", "/sections?course=CSC-43"],
    ["a three-letter suffix", "/sections?course=CSC-4330GGG"],
    ["a repeated course param", "/sections?course=CSC-4330&course=CSC-1350"],
  ])("rejects %s with 400", async (_label, url) => {
    expect(await get(url)).toEqual({ status: 400, body: { error: "invalid course" } });
  });

  it.each([
    ["a lowercase term", "/sections?course=CSC-4330&term=lsuam_fall_2026"],
    ["an empty term", "/sections?course=CSC-4330&term="],
    ["a repeated term param", "/sections?course=CSC-4330&term=A&term=B"],
  ])("rejects %s with 400", async (_label, url) => {
    expect(await get(url)).toEqual({ status: 400, body: { error: "invalid term" } });
  });
});
