import { load, type Cheerio, type CheerioAPI } from "cheerio";
import {
  parseCreditsText,
  SectionSchema,
  type AcademicPeriodId,
  type Meeting,
  type Section,
  type Weekday,
} from "@jevschedule/shared";
import { SectionShapeError } from "./errors.js";

/**
 * A parsed DOM node. cheerio doesn't re-export domhandler's node types and this package has no
 * direct domhandler dependency (see course-detail.ts), so it's read off `load`'s signature.
 */
type DomNode = Extract<Parameters<typeof load>[0], { type: unknown }>;

/** One option of the portal's academic period picker. */
export interface AcademicPeriod {
  id: AcademicPeriodId;
  /** e.g. `Fall Semester 2026`. */
  label: string;
  /** ISO dates (`2026-08-24`), inclusive. */
  startDate: string;
  endDate: string;
}

/** Everything a Course Offerings listing page says about one department in one period. */
export interface SectionListing {
  /** Every period the portal currently offers, in page order. */
  periods: AcademicPeriod[];
  /** The period this page lists sections for; every section's `term`. */
  selectedPeriodId: AcademicPeriodId;
  /** One entry per section, in page order, validated against `SectionSchema`. */
  sections: Section[];
}

const WEEKDAYS: Record<string, Weekday> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

const PERIOD_OPTION_TEXT =
  /^(.+?)\s*\((\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\)$/;
const COURSE_BUTTON_LABEL = /^Expand course details for ([A-Z]{2,4} \d{4}[A-Z]?)$/;
const SECTION_LABEL = /^Section (\d{3})-([A-Z]{3})$/;
const ENROLLMENT_TEXT = /^Enrollment:\s*(\d+)\s*\/\s*(\d+)$/;
const CREDIT_HOURS_TEXT = /^(\d+(?:\s*-\s*\d+)?) Credit Hours?$/;
const TIME = "(\\d{1,2}):(\\d{2})\\s*(AM|PM)";
const MEETING_TEXT = new RegExp(`^((?:[A-Z][a-z]+\\s+)+)${TIME}\\s*-\\s*${TIME}$`);

/** Collapses the page's indentation and non-breaking spaces into single spaces. */
function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** `3:00 PM` -> 900 (minutes after midnight). */
function toMinutes(hour: string, minute: string, meridiem: string): number {
  return (Number(hour) % 12) * 60 + Number(minute) + (meridiem === "PM" ? 12 * 60 : 0);
}

/** `Tuesday Thursday 3:00 PM - 4:20 PM` -> `{ days: ["Tue", "Thu"], startMinute: 900, ... }`. */
function parseMeeting(text: string, where: string): Meeting {
  const match = MEETING_TEXT.exec(text);
  if (!match) throw new SectionShapeError(`${where}: unrecognized meeting pattern "${text}"`);
  const [, dayText = "", startH = "", startM = "", startAp = "", endH = "", endM = "", endAp = ""] =
    match;
  const days = dayText
    .trim()
    .split(/\s+/)
    .map((name) => {
      const day = WEEKDAYS[name];
      if (!day) throw new SectionShapeError(`${where}: unknown weekday "${name}" in "${text}"`);
      return day;
    });
  return {
    days,
    startMinute: toMinutes(startH, startM, startAp),
    endMinute: toMinutes(endH, endM, endAp),
  };
}

/** `08/24/2026` parts -> `2026-08-24`. */
function isoDate(month: string, day: string, year: string): string {
  return `${year}-${month}-${day}`;
}

function parsePeriods($: CheerioAPI): { periods: AcademicPeriod[]; selectedPeriodId: string } {
  const select = $("select#academicPeriod");
  if (select.length !== 1) throw new SectionShapeError("academic period picker not found");

  const periods = select
    .find("option")
    .toArray()
    .map((option) => {
      const id = $(option).attr("value") ?? "";
      const text = clean($(option).text());
      const match = PERIOD_OPTION_TEXT.exec(text);
      if (!id || !match) {
        throw new SectionShapeError(`unrecognized academic period option "${id}": "${text}"`);
      }
      const [, label = "", sm = "", sd = "", sy = "", em = "", ed = "", ey = ""] = match;
      return { id, label, startDate: isoDate(sm, sd, sy), endDate: isoDate(em, ed, ey) };
    });
  if (periods.length === 0) throw new SectionShapeError("academic period picker has no options");

  const selectedPeriodId = select.attr("data-selected-id") ?? "";
  if (!periods.some((period) => period.id === selectedPeriodId)) {
    throw new SectionShapeError(`selected academic period "${selectedPeriodId}" is not an option`);
  }
  return { periods, selectedPeriodId };
}

/**
 * The value after `Label:` in the section, or `null` when the portal left it blank. Ancestors
 * of the labelled element also start with `Label:` but run on into the next field, so the
 * innermost match (the shortest text) wins. Throws if the label is missing altogether.
 */
function labelledValue(
  $: CheerioAPI,
  section: Cheerio<DomNode>,
  label: string,
  where: string,
): string | null {
  const prefix = `${label}:`;
  const text = section
    .find("span, div")
    .toArray()
    .map((el) => clean($(el).text()))
    .filter((candidate) => candidate.startsWith(prefix))
    .sort((a, b) => a.length - b.length)[0];
  if (text === undefined) throw new SectionShapeError(`${where}: no "${prefix}" field`);
  const value = text.slice(prefix.length).trim();
  return value === "" ? null : value;
}

function parseSection(
  $: CheerioAPI,
  section: Cheerio<DomNode>,
  courseCode: string,
  term: string,
): Section {
  const ariaLabel = section.attr("aria-label") ?? "";
  const labelMatch = SECTION_LABEL.exec(ariaLabel);
  if (!labelMatch) {
    throw new SectionShapeError(`${courseCode}: unrecognized section label "${ariaLabel}"`);
  }
  const [, sectionNumber = "", sectionType = ""] = labelMatch;
  const where = `${courseCode} ${sectionNumber}-${sectionType}`;

  const spanTexts = section
    .find("span")
    .toArray()
    .map((el) => clean($(el).text()));

  const enrollment = spanTexts.map((text) => ENROLLMENT_TEXT.exec(text)).find(Boolean);
  if (!enrollment) throw new SectionShapeError(`${where}: no "Enrollment: X/Y" field`);

  const creditHours = spanTexts.map((text) => CREDIT_HOURS_TEXT.exec(text)).find(Boolean);
  if (!creditHours?.[1]) throw new SectionShapeError(`${where}: no "N Credit Hours" field`);

  const patternBlock = section
    .find("div.mb-3")
    .toArray()
    .find((el) => clean($(el).text()).startsWith("Meeting Pattern:"));
  if (!patternBlock) throw new SectionShapeError(`${where}: no "Meeting Pattern:" field`);
  const meetings = $(patternBlock)
    .find("span span")
    .toArray()
    .map((el) => clean($(el).text()))
    .filter((text) => text !== "")
    .map((text) => parseMeeting(text, where));

  const parsed = SectionSchema.safeParse({
    term,
    courseCode,
    sectionNumber,
    sectionType,
    credits: parseCreditsText(creditHours[1]),
    instructor: labelledValue($, section, "Instructor", where),
    location: labelledValue($, section, "Location", where),
    deliveryMode: labelledValue($, section, "Delivery Mode", where),
    enrollment: Number(enrollment[1]),
    capacity: Number(enrollment[2]),
    meetings,
  });
  if (!parsed.success) {
    throw new SectionShapeError(`${where}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  return parsed.data;
}

/**
 * Parses a public Course Offerings listing page (`courseofferings.lsu.edu/LSU?...`, T-402) into
 * its academic periods and the sections of the selected period.
 *
 * The portal renders every course block twice in a row, so repeated blocks are dropped; a
 * repeat that differs from the first copy throws, since we couldn't tell which one is right.
 *
 * Pure and network-free. Throws {@link SectionShapeError} when the page no longer looks like a
 * listing, rather than returning a partial result.
 */
export function parseSectionListing(html: string): SectionListing {
  const $ = load(html);
  const { periods, selectedPeriodId } = parsePeriods($);

  const sectionsByCourse = new Map<string, Section[]>();
  $("div.course-accordion").each((_, accordion) => {
    const buttonLabel = $(accordion).find("button.accordion-button").attr("aria-label") ?? "";
    const courseCode = COURSE_BUTTON_LABEL.exec(buttonLabel)?.[1];
    if (!courseCode) {
      throw new SectionShapeError(`unrecognized course heading "${buttonLabel}"`);
    }

    const courseSections = $(accordion)
      .find("section[aria-label]")
      .toArray()
      .map((element) => parseSection($, $(element), courseCode, selectedPeriodId));
    if (courseSections.length === 0) {
      throw new SectionShapeError(`${courseCode}: course block has no sections`);
    }

    const earlier = sectionsByCourse.get(courseCode);
    if (earlier) {
      if (JSON.stringify(earlier) !== JSON.stringify(courseSections)) {
        throw new SectionShapeError(`${courseCode}: repeated course block differs from the first`);
      }
      return;
    }
    sectionsByCourse.set(courseCode, courseSections);
  });

  const sections = [...sectionsByCourse.values()].flat();
  if (sections.length === 0) throw new SectionShapeError("no course sections found on the page");
  return { periods, selectedPeriodId, sections };
}
