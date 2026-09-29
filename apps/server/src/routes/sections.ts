import type { FastifyInstance } from "fastify";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  AcademicPeriodIdSchema,
  SectionCourseCodeSchema,
  type Meeting,
  type Section,
} from "@jevschedule/shared";
import type { Db } from "../db/client.js";
import { meetings, sections, type SectionRow } from "../db/schema.js";

/** `CSC-4330`, like `/courses/:id`, plus the portal's suffixes (`CSC-4330G`, `CSC-4890GE`). */
const COURSE_PARAM_REGEX = /^[A-Z]{2,4}-\d{4}[A-Z]{0,2}$/;

interface SectionsQuery {
  course?: unknown;
  term?: unknown;
}

export interface SectionsResponse {
  sections: Section[];
}

function toSection(row: SectionRow, sectionMeetings: Meeting[]): Section {
  return {
    term: row.term,
    courseCode: row.courseCode,
    sectionNumber: row.sectionNumber,
    sectionType: row.sectionType,
    credits: { min: row.creditsMin, max: row.creditsMax, note: row.creditsNote },
    instructor: row.instructor,
    location: row.location,
    deliveryMode: row.deliveryMode,
    enrollment: row.enrollment,
    capacity: row.capacity,
    meetings: sectionMeetings,
  };
}

/**
 * `GET /sections?course=CSC-4330&term=LSUAM_FALL_2026` (T-404): a course's sections with their
 * meeting times, as last scraped from the Course Offerings portal. `term` is optional; without
 * it, sections from every stored term are returned, each tagged with its `term`. A course with
 * no sections is an empty list, not a 404, since most courses aren't offered every term.
 */
export function registerSectionRoutes(app: FastifyInstance, deps: { db: Db }): void {
  const { db } = deps;

  app.get<{ Querystring: SectionsQuery }>("/sections", async (request, reply) => {
    const { course: rawCourse, term: rawTerm } = request.query;

    if (typeof rawCourse !== "string" || !COURSE_PARAM_REGEX.test(rawCourse.toUpperCase())) {
      return reply.status(400).send({ error: "invalid course" });
    }
    const courseCode = SectionCourseCodeSchema.parse(rawCourse.toUpperCase().replace("-", " "));

    let term: string | undefined;
    if (rawTerm !== undefined) {
      const parsed = AcademicPeriodIdSchema.safeParse(rawTerm);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid term" });
      }
      term = parsed.data;
    }

    const conditions = [eq(sections.courseCode, courseCode)];
    if (term !== undefined) conditions.push(eq(sections.term, term));
    const rows = await db
      .select()
      .from(sections)
      .where(and(...conditions))
      .orderBy(asc(sections.term), asc(sections.sectionNumber), asc(sections.sectionType));
    if (rows.length === 0) {
      return reply.send({ sections: [] } satisfies SectionsResponse);
    }

    const meetingRows = await db
      .select()
      .from(meetings)
      .where(
        inArray(
          meetings.sectionId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(meetings.sectionId), asc(meetings.startMinute), asc(meetings.id));
    const meetingsBySection = new Map<number, Meeting[]>();
    for (const { sectionId, days, startMinute, endMinute } of meetingRows) {
      const list = meetingsBySection.get(sectionId) ?? [];
      list.push({ days, startMinute, endMinute });
      meetingsBySection.set(sectionId, list);
    }

    return reply.send({
      sections: rows.map((row) => toSection(row, meetingsBySection.get(row.id) ?? [])),
    } satisfies SectionsResponse);
  });
}
