import type { FastifyInstance } from "fastify";
import { and, asc, eq, max } from "drizzle-orm";
import { CatalogYearSchema, type Course, type CourseDetail } from "@jevschedule/shared";
import type { Db } from "../db/client.js";
import { courses, sectionArchive, type CourseRow } from "../db/schema.js";

const DEPT_REGEX = /^[A-Z]{2,4}$/;
const COURSE_ID_REGEX = /^[A-Z]{2,4}-\d{4}[A-Z]{0,2}$/;

interface CoursesQuery {
  dept?: unknown;
  catalogYear?: unknown;
}

interface CourseParams {
  id: unknown;
}

interface CourseQuery {
  catalogYear?: unknown;
}

function toCourse(row: CourseRow): Course {
  return {
    catalogYear: row.catalogYear,
    code: row.code,
    title: row.title,
    credits: {
      min: row.creditsMin,
      max: row.creditsMax,
      note: row.creditsNote,
    },
    description: row.description,
    prerequisiteText: row.prerequisiteText,
  };
}

/** Archived terms where a course had at least one offered section. */
export interface CourseHistoryResponse {
  history: { term: string; sectionCount: number; capturedAt: string }[];
}

function toCourseDetail(row: CourseRow): CourseDetail {
  return {
    ...toCourse(row),
    prereq: {
      tree: row.prereqTree,
      needsReview: row.prereqNeedsReview,
      reviewReason: row.prereqReviewReason,
      notes: row.prereqNotes,
    },
  };
}

async function resolveCatalogYear(
  db: Db,
  queryCatalogYear: unknown,
): Promise<{ catalogYear?: string; error?: string }> {
  if (queryCatalogYear !== undefined) {
    if (typeof queryCatalogYear !== "string") {
      return { error: "invalid catalogYear" };
    }
    const parsed = CatalogYearSchema.safeParse(queryCatalogYear);
    if (!parsed.success) {
      return { error: "invalid catalogYear" };
    }
    return { catalogYear: parsed.data };
  }

  const [maxResult] = await db.select({ maxYear: max(courses.catalogYear) }).from(courses);
  return { catalogYear: maxResult?.maxYear ?? undefined };
}

export function registerCourseRoutes(app: FastifyInstance, deps: { db: Db }): void {
  const { db } = deps;

  app.get<{ Querystring: CoursesQuery }>("/courses", async (request, reply) => {
    const { dept: rawDept, catalogYear: rawCatalogYear } = request.query;

    let dept: string | undefined;
    if (rawDept !== undefined) {
      if (typeof rawDept !== "string") {
        return reply.status(400).send({ error: "invalid dept" });
      }
      const uppercased = rawDept.toUpperCase();
      if (!DEPT_REGEX.test(uppercased)) {
        return reply.status(400).send({ error: "invalid dept" });
      }
      dept = uppercased;
    }

    const { catalogYear, error } = await resolveCatalogYear(db, rawCatalogYear);
    if (error) {
      return reply.status(400).send({ error });
    }
    if (!catalogYear) {
      return reply.send({ courses: [] });
    }

    const conditions = [eq(courses.catalogYear, catalogYear)];
    if (dept !== undefined) {
      conditions.push(eq(courses.dept, dept));
    }

    const rows = await db
      .select()
      .from(courses)
      .where(and(...conditions))
      .orderBy(asc(courses.code));

    return reply.send({ courses: rows.map(toCourse) });
  });

  app.get<{ Params: CourseParams; Querystring: CourseQuery }>(
    "/courses/:id",
    async (request, reply) => {
      const rawId = request.params.id;
      if (typeof rawId !== "string") {
        return reply.status(400).send({ error: "invalid course id" });
      }

      const normalizedId = rawId.toUpperCase();
      if (!COURSE_ID_REGEX.test(normalizedId)) {
        return reply.status(400).send({ error: "invalid course id" });
      }

      const { catalogYear, error } = await resolveCatalogYear(db, request.query.catalogYear);
      if (error) {
        return reply.status(400).send({ error });
      }
      if (!catalogYear) {
        return reply.status(404).send({ error: "Course not found" });
      }

      const code = normalizedId.replace("-", " ");
      const [row] = await db
        .select()
        .from(courses)
        .where(and(eq(courses.catalogYear, catalogYear), eq(courses.code, code)))
        .limit(1);

      if (!row) {
        return reply.status(404).send({ error: "Course not found" });
      }

      return reply.send(toCourseDetail(row));
    },
  );

  app.get<{ Params: CourseParams }>("/courses/:id/history", async (request, reply) => {
    const rawId = request.params.id;
    if (typeof rawId !== "string" || !COURSE_ID_REGEX.test(rawId.toUpperCase())) {
      return reply.status(400).send({ error: "invalid course id" });
    }

    const code = rawId.toUpperCase().replace("-", " ");
    const department = code.split(" ")[0]!;
    const snapshots = await db
      .select({
        term: sectionArchive.term,
        capturedAt: sectionArchive.capturedAt,
        sections: sectionArchive.sections,
      })
      .from(sectionArchive)
      .where(eq(sectionArchive.department, department))
      .orderBy(asc(sectionArchive.term));

    const history = snapshots.flatMap((snapshot) => {
      const sectionCount = snapshot.sections.filter(
        (section) => section.courseCode === code,
      ).length;
      return sectionCount === 0
        ? []
        : [{ term: snapshot.term, sectionCount, capturedAt: snapshot.capturedAt.toISOString() }];
    });
    return reply.send({ history } satisfies CourseHistoryResponse);
  });
}
