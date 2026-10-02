import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AcademicPeriodIdSchema, SectionCourseCodeSchema } from "@jevschedule/shared";
import type { Db } from "../db/client.js";
import { sections, watches } from "../db/schema.js";

const WatchSectionSchema = z.object({
  term: AcademicPeriodIdSchema,
  courseCode: SectionCourseCodeSchema,
  sectionNumber: z.string().regex(/^\d{3}$/),
  sectionType: z.string().regex(/^[A-Z]{3}$/),
});
const DeleteWatchSchema = z.object({ id: z.string().uuid() });

/** A watch ID is a bearer token. The desktop app keeps it on the student's device. */
export function registerWatchRoutes(app: FastifyInstance, deps: { db: Db }): void {
  const { db } = deps;

  app.get<{ Params: { id: string } }>("/watches/:id", async (request, reply) => {
    if (!z.string().uuid().safeParse(request.params.id).success) {
      return reply.status(400).send({ error: "invalid watch id" });
    }
    const [watch] = await db
      .select({
        term: watches.term,
        courseCode: watches.courseCode,
        sectionNumber: watches.sectionNumber,
        sectionType: watches.sectionType,
        enrollment: watches.lastEnrollment,
        capacity: watches.lastCapacity,
        lastOpenedAt: watches.lastOpenedAt,
      })
      .from(watches)
      .where(eq(watches.id, request.params.id))
      .limit(1);
    if (!watch) return reply.status(404).send({ error: "Watch not found" });
    return {
      ...watch,
      lastOpenedAt: watch.lastOpenedAt?.toISOString() ?? null,
    };
  });

  app.post<{ Body: unknown }>("/watches", async (request, reply) => {
    const parsed = WatchSectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid section" });

    const { term, courseCode, sectionNumber, sectionType } = parsed.data;
    const [section] = await db
      .select()
      .from(sections)
      .where(
        and(
          eq(sections.term, term),
          eq(sections.courseCode, courseCode),
          eq(sections.sectionNumber, sectionNumber),
          eq(sections.sectionType, sectionType),
        ),
      )
      .limit(1);
    if (!section) return reply.status(404).send({ error: "Section not found" });

    const [watch] = await db
      .insert(watches)
      .values({
        term,
        courseCode,
        sectionNumber,
        sectionType,
        lastEnrollment: section.enrollment,
        lastCapacity: section.capacity,
      })
      .returning({ id: watches.id });
    return reply.status(201).send({ id: watch!.id });
  });

  app.delete<{ Body: unknown }>("/watches", async (request, reply) => {
    const parsed = DeleteWatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid watch id" });
    await db.delete(watches).where(eq(watches.id, parsed.data.id));
    return reply.status(204).send();
  });
}
