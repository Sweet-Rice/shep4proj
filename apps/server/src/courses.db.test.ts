import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Course, type CourseDetail } from "@jevschedule/shared";
import { buildServer } from "./app.js";
import { seedCatalogFixtures } from "./catalog/seed.js";
import { createDb, type Db } from "./db/client.js";
import { getTestDatabaseUrl, truncateCourses } from "./test-support/db.js";

describe.skipIf(!getTestDatabaseUrl())("courses routes", () => {
  let app: FastifyInstance;
  let db: Db;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    const dbUrl = getTestDatabaseUrl();
    if (!dbUrl) {
      throw new Error("DATABASE_URL is required for integration tests");
    }
    const client = createDb(dbUrl);
    db = client.db;
    closeDb = client.close;

    await truncateCourses(db);
    await seedCatalogFixtures(db);

    app = buildServer({ db });
  });

  afterAll(async () => {
    await app?.close();
    await closeDb?.();
  });

  describe("GET /courses", () => {
    it("returns courses for dept CSC in code order", async () => {
      const res = await app.inject({ method: "GET", url: "/courses?dept=CSC" });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ courses: Course[] }>();
      expect(body.courses.map((c) => c.code)).toEqual([
        "CSC 1350",
        "CSC 2700",
        "CSC 3102",
        "CSC 3200",
        "CSC 4330",
      ]);
    });

    it("handles lowercase dept query param", async () => {
      const res = await app.inject({ method: "GET", url: "/courses?dept=csc" });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ courses: Course[] }>();
      expect(body.courses.map((c) => c.code)).toEqual([
        "CSC 1350",
        "CSC 2700",
        "CSC 3102",
        "CSC 3200",
        "CSC 4330",
      ]);
    });

    it("returns empty courses list for dept with no courses", async () => {
      const res = await app.inject({ method: "GET", url: "/courses?dept=MATH" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ courses: [] });
    });

    it("returns 400 for invalid dept", async () => {
      const res = await app.inject({ method: "GET", url: "/courses?dept=C1" });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "invalid dept" });
    });

    it("returns all courses sorted by code when dept is omitted", async () => {
      const res = await app.inject({ method: "GET", url: "/courses" });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ courses: Course[] }>();
      expect(body.courses.map((c) => c.code)).toEqual([
        "CSC 1350",
        "CSC 2700",
        "CSC 3102",
        "CSC 3200",
        "CSC 4330",
      ]);
    });

    it("returns 400 for invalid catalogYear", async () => {
      const res = await app.inject({ method: "GET", url: "/courses?catalogYear=2026" });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "invalid catalogYear" });
    });

    it("returns empty courses list for valid catalogYear with no courses", async () => {
      const res = await app.inject({ method: "GET", url: "/courses?catalogYear=1999-2000" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ courses: [] });
    });
  });

  describe("GET /courses/:id", () => {
    it("returns course details for CSC-4330", async () => {
      const res = await app.inject({ method: "GET", url: "/courses/CSC-4330" });

      expect(res.statusCode).toBe(200);
      const course = res.json<CourseDetail>();
      expect(course.title).toBe("Software Systems Development");
      expect(course.credits).toEqual({ min: 3, max: 3, note: null });
      expect(course.prerequisiteText).toBe("CSC 3102, CSC 3380.");
      expect(course.prereq.tree).toEqual({
        type: "AND",
        children: [
          { type: "COURSE", code: "CSC 3102", coreq: false, minGrade: null },
          { type: "COURSE", code: "CSC 3380", coreq: false, minGrade: null },
        ],
      });
      expect(course.prereq.needsReview).toBe(false);
      expect(course.prereq.notes).toEqual([]);
    });

    it("returns course details for CSC-3102 with needsReview flag and reviewReason", async () => {
      const res = await app.inject({ method: "GET", url: "/courses/CSC-3102" });

      expect(res.statusCode).toBe(200);
      const course = res.json<CourseDetail>();
      expect(course.code).toBe("CSC 3102");
      expect(course.prereq.needsReview).toBe(true);
      expect(course.prereq.tree).toBeNull();
      expect(course.prereq.reviewReason?.startsWith("ambiguous-and-or")).toBe(true);
    });

    it("returns course details for CSC-1350 with OR coreq prereq tree", async () => {
      const res = await app.inject({ method: "GET", url: "/courses/CSC-1350" });

      expect(res.statusCode).toBe(200);
      const course = res.json<CourseDetail>();
      expect(course.code).toBe("CSC 1350");
      expect(course.prereq.tree).toEqual({
        type: "OR",
        children: [
          { type: "COURSE", code: "MATH 1022", coreq: true, minGrade: null },
          { type: "COURSE", code: "MATH 1023", coreq: true, minGrade: null },
          { type: "COURSE", code: "MATH 1550", coreq: true, minGrade: null },
          { type: "COURSE", code: "MATH 1551", coreq: true, minGrade: null },
          { type: "COURSE", code: "MATH 1552", coreq: true, minGrade: null },
        ],
      });
      expect(course.prereq.tree?.type).toBe("OR");
      if (course.prereq.tree?.type === "OR") {
        expect(course.prereq.tree.children).toHaveLength(5);
        for (const child of course.prereq.tree.children) {
          expect(child.type).toBe("COURSE");
          if (child.type === "COURSE") {
            expect(child.coreq).toBe(true);
          }
        }
      }
    });

    it("returns course details for lowercase course id csc-2700", async () => {
      const res = await app.inject({ method: "GET", url: "/courses/csc-2700" });

      expect(res.statusCode).toBe(200);
      const course = res.json<Course>();
      expect(course.credits).toEqual({ min: 1, max: 3, note: null });
    });

    it("returns 404 for nonexistent course id", async () => {
      const res = await app.inject({ method: "GET", url: "/courses/CSC-9999" });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Course not found" });
    });
    it("returns 404 for a missing suffixed course id", async () => {
      const res = await app.inject({ method: "GET", url: "/courses/CSC-4330G" });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Course not found" });
    });

    it("returns 400 for malformed course id", async () => {
      const res = await app.inject({ method: "GET", url: "/courses/nope" });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "invalid course id" });
    });

    it("returns 400 for invalid catalogYear query param", async () => {
      const res = await app.inject({ method: "GET", url: "/courses/CSC-4330?catalogYear=bad" });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "invalid catalogYear" });
    });

    it("returns 404 when course exists in catalog but not for requested catalogYear", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/courses/CSC-4330?catalogYear=1999-2000",
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Course not found" });
    });
  });
});
