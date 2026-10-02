import type { FastifyInstance } from "fastify";
import type { Section } from "@jevschedule/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import { createDb, type Db } from "./db/client.js";
import { watches } from "./db/schema.js";
import { replaceTermSections } from "./sections/store.js";
import { getTestDatabaseUrl, truncateSections, truncateWatches } from "./test-support/db.js";

const section: Section = {
  term: "LSUAM_FALL_2026",
  courseCode: "CSC 4330",
  sectionNumber: "001",
  sectionType: "LEC",
  credits: { min: 3, max: 3, note: null },
  instructor: null,
  location: null,
  deliveryMode: "On Campus",
  enrollment: 78,
  capacity: 80,
  meetings: [],
};
const identity = {
  term: section.term,
  courseCode: section.courseCode,
  sectionNumber: section.sectionNumber,
  sectionType: section.sectionType,
};

describe.skipIf(!getTestDatabaseUrl())("watches routes", () => {
  let app: FastifyInstance;
  let db: Db;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    const dbUrl = getTestDatabaseUrl();
    if (!dbUrl) throw new Error("DATABASE_URL is required for integration tests");
    ({ db, close: closeDb } = createDb(dbUrl));
    await truncateWatches(db);
    await truncateSections(db);
    await replaceTermSections(db, {
      department: "CSC",
      term: section.term,
      sections: [section],
      scrapedAt: new Date("2026-09-30T12:00:00Z"),
    });
    app = buildServer({ db });
  });

  beforeEach(async () => {
    await truncateWatches(db);
  });

  afterAll(async () => {
    await app?.close();
    await closeDb?.();
  });

  it("creates a watch for an existing section with its current seat counts", async () => {
    const response = await app.inject({ method: "POST", url: "/watches", payload: identity });
    expect(response.statusCode).toBe(201);
    const { id } = response.json<{ id: string }>();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await db.select().from(watches);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, ...identity, lastEnrollment: 78, lastCapacity: 80 });
  });

  it("rejects malformed or unavailable sections", async () => {
    const malformed = await app.inject({ method: "POST", url: "/watches", payload: {} });
    expect(malformed.statusCode).toBe(400);
    const missing = await app.inject({
      method: "POST",
      url: "/watches",
      payload: { ...identity, sectionNumber: "999" },
    });
    expect(missing.statusCode).toBe(404);
    expect(await db.select().from(watches)).toHaveLength(0);
  });

  it("gets watch details without exposing its bearer ID", async () => {
    const created = await app.inject({ method: "POST", url: "/watches", payload: identity });
    const id = created.json<{ id: string }>().id;
    const details = await app.inject({ method: "GET", url: `/watches/${id}` });
    expect(details.statusCode).toBe(200);
    expect(details.json()).toEqual({
      ...identity,
      enrollment: 78,
      capacity: 80,
      lastOpenedAt: null,
    });
    expect(details.body).not.toContain(id);
    const openedAt = new Date("2026-10-01T12:34:56.000Z");
    await db.update(watches).set({ lastOpenedAt: openedAt });
    const timestamp = await app.inject({ method: "GET", url: `/watches/${id}` });
    expect(timestamp.json()).toMatchObject({ ...identity, lastOpenedAt: openedAt.toISOString() });

    const invalid = await app.inject({ method: "GET", url: "/watches/not-a-uuid" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: "invalid watch id" });
    const unknown = await app.inject({
      method: "GET",
      url: "/watches/0f6b6a1c-3c2e-4b55-9d1f-2b8c5f0e7a11",
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "Watch not found" });
  });

  it("removes only the watch named by its opaque ID", async () => {
    const first = await app.inject({ method: "POST", url: "/watches", payload: identity });
    const second = await app.inject({ method: "POST", url: "/watches", payload: identity });
    const firstId = first.json<{ id: string }>().id;
    const secondId = second.json<{ id: string }>().id;

    const invalid = await app.inject({ method: "DELETE", url: "/watches", payload: { id: "x" } });
    expect(invalid.statusCode).toBe(400);
    const removed = await app.inject({
      method: "DELETE",
      url: "/watches",
      payload: { id: firstId },
    });
    expect(removed.statusCode).toBe(204);
    expect((await db.select({ id: watches.id }).from(watches)).map((row) => row.id)).toEqual([
      secondId,
    ]);
    expect(
      (await app.inject({ method: "DELETE", url: "/watches", payload: { id: firstId } }))
        .statusCode,
    ).toBe(204);
  });
});
