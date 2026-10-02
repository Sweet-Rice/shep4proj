import { z } from "zod";
import { CreditsSchema } from "./course.js";
import { CourseCodeSchema } from "./course-code.js";
import type { Season } from "./plan.js";

/**
 * Course Offerings academic period id, e.g. `LSUAM_FALL_2026` or `LSUAM_ONLINE_FALL_1_2026`.
 * A section's term is the period it was listed under; the ids come from the portal (T-403).
 */
export const AcademicPeriodIdSchema = z.string().regex(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/);

export type AcademicPeriodId = z.infer<typeof AcademicPeriodIdSchema>;

export function termToPeriodId(term: { season: Season; year: number }): AcademicPeriodId {
  return AcademicPeriodIdSchema.parse(`LSUAM_${term.season.toUpperCase()}_${term.year}`);
}

export const WeekdaySchema = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

export type Weekday = z.infer<typeof WeekdaySchema>;

const MINUTES_PER_DAY = 24 * 60;

/**
 * One weekly meeting pattern: the days it meets and its time window, in minutes after midnight
 * local time (e.g. 3:00 PM is 900). Minutes keep conflict checks (T-411) to plain integer math.
 */
export const MeetingSchema = z
  .object({
    days: z
      .array(WeekdaySchema)
      .min(1)
      .refine((days) => new Set(days).size === days.length, "meeting days must be unique"),
    startMinute: z.number().int().min(0).max(MINUTES_PER_DAY),
    endMinute: z.number().int().min(0).max(MINUTES_PER_DAY),
  })
  .refine((meeting) => meeting.startMinute < meeting.endMinute, {
    message: "meeting must start before it ends",
    path: ["endMinute"],
  });

export type Meeting = z.infer<typeof MeetingSchema>;

/**
 * One section of a course in one term, as scraped from the public Course Offerings portal
 * (US-11). A section is identified by term + course + number + type: `001-LEC` and `001-LAB`
 * are different sections of the same course.
 *
 * Blank portal fields are `null`, and a section with no meeting times (web-based, research,
 * independent study) has no meetings. `enrollment` can exceed `capacity`; the portal shows
 * over-enrolled sections such as 96/95.
 */
export const SectionSchema = z.object({
  term: AcademicPeriodIdSchema,
  courseCode: CourseCodeSchema,
  sectionNumber: z.string().regex(/^\d{3}$/),
  sectionType: z.string().regex(/^[A-Z]{3}$/),
  credits: CreditsSchema,
  instructor: z.string().trim().min(1).nullable(),
  location: z.string().trim().min(1).nullable(),
  deliveryMode: z.string().trim().min(1).nullable(),
  enrollment: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
  meetings: z.array(MeetingSchema),
});

export type Section = z.infer<typeof SectionSchema>;
