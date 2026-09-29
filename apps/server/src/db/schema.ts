import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { PrereqNode } from "@jevschedule/shared";

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
