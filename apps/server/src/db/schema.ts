import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { PrereqNode, Weekday } from "@jevschedule/shared";

// One row per course per catalog year. Credits are a min/max range because some
// catalog courses are variable-credit (e.g. "1-12 per sem."); credits_note keeps the
// trailing catalog text so nothing is lost.
export const courses = pgTable(
  "courses",
  {
    id: serial("id").primaryKey(),
    catalogYear: text("catalog_year").notNull(),
    code: text("code").notNull(),
    dept: text("dept").notNull(),
    title: text("title").notNull(),
    creditsMin: doublePrecision("credits_min").notNull(),
    creditsMax: doublePrecision("credits_max").notNull(),
    creditsNote: text("credits_note"),
    description: text("description").notNull(),
    prerequisiteText: text("prerequisite_text"),
    prereqTree: jsonb("prereq_tree").$type<PrereqNode | null>(),
    prereqNeedsReview: boolean("prereq_needs_review").notNull().default(false),
    prereqReviewReason: text("prereq_review_reason"),
    prereqNotes: jsonb("prereq_notes").$type<string[]>().notNull().default([]),
    coid: text("coid").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("courses_catalog_year_code_key").on(table.catalogYear, table.code),
    index("courses_catalog_year_dept_idx").on(table.catalogYear, table.dept),
  ],
);

export type CourseRow = typeof courses.$inferSelect;
export type NewCourseRow = typeof courses.$inferInsert;

// One row per section per term, from the public Course Offerings portal (US-11). No foreign
// key to courses: sections include codes the catalog doesn't list (e.g. CSC 4330G, #196) and
// courses from catalog years we haven't scraped. Blank portal fields are null.
export const sections = pgTable(
  "sections",
  {
    id: serial("id").primaryKey(),
    term: text("term").notNull(),
    courseCode: text("course_code").notNull(),
    sectionNumber: text("section_number").notNull(),
    sectionType: text("section_type").notNull(),
    creditsMin: doublePrecision("credits_min").notNull(),
    creditsMax: doublePrecision("credits_max").notNull(),
    creditsNote: text("credits_note"),
    instructor: text("instructor"),
    location: text("location"),
    deliveryMode: text("delivery_mode"),
    enrollment: integer("enrollment").notNull(),
    capacity: integer("capacity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sections_term_course_section_key").on(
      table.term,
      table.courseCode,
      table.sectionNumber,
      table.sectionType,
    ),
  ],
);

export type SectionRow = typeof sections.$inferSelect;
export type NewSectionRow = typeof sections.$inferInsert;

// Weekly meeting patterns for a section; a section with none has no scheduled time (TBA).
// Times are minutes after midnight, matching MeetingSchema in packages/shared.
export const meetings = pgTable(
  "meetings",
  {
    id: serial("id").primaryKey(),
    sectionId: integer("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    days: text("days").array().$type<Weekday[]>().notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (table) => [index("meetings_section_id_idx").on(table.sectionId)],
);

export type MeetingRow = typeof meetings.$inferSelect;
export type NewMeetingRow = typeof meetings.$inferInsert;
