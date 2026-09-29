import { and, eq, like, sql } from "drizzle-orm";
import type { Section } from "@jevschedule/shared";
import type { Db } from "../db/client.js";
import {
  meetings,
  sectionArchive,
  sections,
  sectionScrapes,
  type NewSectionRow,
} from "../db/schema.js";

/** A department prefix such as `CSC`: letters only, so it's safe inside a LIKE pattern. */
export const DEPARTMENT_PATTERN = /^[A-Z]{2,4}$/;

function toSectionRow(section: Section): NewSectionRow {
  return {
    term: section.term,
    courseCode: section.courseCode,
    sectionNumber: section.sectionNumber,
    sectionType: section.sectionType,
    creditsMin: section.credits.min,
    creditsMax: section.credits.max,
    creditsNote: section.credits.note,
    instructor: section.instructor,
    location: section.location,
    deliveryMode: section.deliveryMode,
    enrollment: section.enrollment,
    capacity: section.capacity,
  };
}

/**
 * Replaces one department's sections for one term with `termSections`, records the scrape and
 * writes the term's archive snapshot (T-501), all in one transaction, so readers see either the
 * old listing or the new one and the archive never disagrees with it. Replacing
 * rather than upserting drops sections the portal no longer lists (cancelled sections).
 * Other departments' sections for the same term are untouched.
 */
export async function replaceTermSections(
  db: Db,
  o: { department: string; term: string; sections: readonly Section[]; scrapedAt: Date },
): Promise<void> {
  if (!DEPARTMENT_PATTERN.test(o.department)) {
    throw new Error(`department must be 2-4 capital letters, got "${o.department}"`);
  }
  const prefix = `${o.department} `;
  const outside = o.sections.find((s) => s.term !== o.term || !s.courseCode.startsWith(prefix));
  if (outside) {
    throw new Error(
      `section ${outside.courseCode} ${outside.sectionNumber}-${outside.sectionType} (${outside.term}) ` +
        `is not a ${o.department} section for ${o.term}`,
    );
  }

  await db.transaction(async (tx) => {
    // DEPARTMENT_PATTERN allows letters only, so the LIKE pattern has no wildcards in it.
    await tx
      .delete(sections)
      .where(and(eq(sections.term, o.term), like(sections.courseCode, `${prefix}%`)));

    if (o.sections.length > 0) {
      const inserted = await tx
        .insert(sections)
        .values(o.sections.map(toSectionRow))
        .returning({ id: sections.id });
      const meetingRows = o.sections.flatMap((section, index) => {
        const sectionId = inserted[index]?.id;
        if (sectionId === undefined) throw new Error("section insert returned too few rows");
        return section.meetings.map((meeting) => ({ sectionId, ...meeting }));
      });
      if (meetingRows.length > 0) await tx.insert(meetings).values(meetingRows);
    }

    await tx
      .insert(sectionScrapes)
      .values({
        department: o.department,
        term: o.term,
        scrapedAt: o.scrapedAt,
        sectionCount: o.sections.length,
      })
      .onConflictDoUpdate({
        target: [sectionScrapes.department, sectionScrapes.term],
        set: { scrapedAt: o.scrapedAt, sectionCount: sql`excluded.section_count` },
      });

    await tx
      .insert(sectionArchive)
      .values({
        term: o.term,
        department: o.department,
        capturedAt: o.scrapedAt,
        sections: [...o.sections],
      })
      .onConflictDoUpdate({
        target: [sectionArchive.term, sectionArchive.department],
        set: { capturedAt: o.scrapedAt, sections: sql`excluded.sections` },
      });
  });
}
