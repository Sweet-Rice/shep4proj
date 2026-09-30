import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SectionShapeError } from "./errors.js";
import { parseAcademicPeriods, parseSectionListing } from "./section-listing.js";

const FIXTURE = fileURLToPath(
  new URL("../../../../fixtures/sections/fall-2026/csc.html", import.meta.url),
);
const listing = parseSectionListing(readFileSync(FIXTURE, "utf8"));

const find = (courseCode: string, sectionNumber: string, sectionType: string) =>
  listing.sections.find(
    (s) =>
      s.courseCode === courseCode &&
      s.sectionNumber === sectionNumber &&
      s.sectionType === sectionType,
  );

describe("parseSectionListing on the Fall 2026 CSC fixture", () => {
  it("lists every academic period the portal offers and which one is selected", () => {
    expect(listing.selectedPeriodId).toBe("LSUAM_FALL_2026");
    expect(listing.periods.map((p) => p.id)).toEqual([
      "LSUAM_FALL_2026",
      "LSUAM_FALL_1_2026",
      "LSUAM_ONLINE_FALL_1_2026",
      "LSUAM_ONLINE_FALL_2_2026",
      "LSUAM_FALL_2_2026",
    ]);
    expect(listing.periods[0]).toEqual({
      id: "LSUAM_FALL_2026",
      label: "Fall Semester 2026",
      startDate: "2026-08-24",
      endDate: "2026-12-12",
    });
  });

  it("drops the repeated copy of each course block", () => {
    // The page renders all 54 courses twice; 188 is the de-duplicated section count.
    expect(new Set(listing.sections.map((s) => s.courseCode)).size).toBe(54);
    expect(listing.sections).toHaveLength(188);
    const keys = listing.sections.map((s) => `${s.courseCode} ${s.sectionNumber}-${s.sectionType}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("tags every section with the selected period", () => {
    expect(new Set(listing.sections.map((s) => s.term))).toEqual(new Set(["LSUAM_FALL_2026"]));
  });

  it("parses a scheduled lecture", () => {
    expect(find("CSC 4330", "001", "LEC")).toEqual({
      term: "LSUAM_FALL_2026",
      courseCode: "CSC 4330",
      sectionNumber: "001",
      sectionType: "LEC",
      credits: { min: 3, max: 3, note: null },
      instructor: "David C. Shepherd",
      location: "1206 Patrick F. Taylor Hall",
      deliveryMode: "On Campus",
      enrollment: 78,
      capacity: 78,
      meetings: [{ days: ["Tue", "Thu"], startMinute: 15 * 60, endMinute: 16 * 60 + 20 }],
    });
  });

  it("parses a web-based section with no meeting pattern or location", () => {
    expect(find("CSC 1110", "001", "LEC")).toMatchObject({
      deliveryMode: "Web-Based",
      location: null,
      instructor: "Kellie Dieutto",
      meetings: [],
    });
  });

  it("parses a zero-credit lab with no instructor or location", () => {
    expect(find("CSC 1350", "001", "LAB")).toMatchObject({
      credits: { min: 0, max: 0, note: null },
      instructor: null,
      location: null,
      meetings: [{ days: ["Thu"], startMinute: 16 * 60 + 30, endMinute: 19 * 60 + 20 }],
    });
  });

  it("parses AM times and three-day patterns", () => {
    const morning = listing.sections.find((s) =>
      s.meetings.some((m) => m.days.length === 3 && m.startMinute < 12 * 60),
    );
    expect(morning?.meetings[0]?.days).toEqual(["Mon", "Wed", "Fri"]);
  });

  it("keeps an instructor's name separate from the Tags field", () => {
    expect(find("CSC 4330", "002", "LEC")?.instructor).toBe("Anas Mahmoud");
    expect(listing.sections.filter((s) => s.instructor?.includes("Tags"))).toEqual([]);
  });

  it("keeps over-enrolled sections as the portal reports them", () => {
    expect(find("CSC 4101", "001", "LEC")).toMatchObject({ enrollment: 96, capacity: 95 });
  });

  it("parses credit ranges", () => {
    const ranges = listing.sections.filter((s) => s.credits.min !== s.credits.max);
    expect(new Set(ranges.map((s) => `${s.credits.min}-${s.credits.max}`))).toEqual(
      new Set(["1-3", "1-9", "1-12"]),
    );
  });

  it("keeps graduate-credit course codes with their G suffix", () => {
    const suffixed = new Set(
      listing.sections.map((s) => s.courseCode).filter((code) => code.endsWith("G")),
    );
    expect(suffixed.size).toBe(11);
    expect(suffixed.has("CSC 4330G")).toBe(true);
  });

  it("counts blank fields as the markup has them", () => {
    expect(listing.sections.filter((s) => s.meetings.length === 0)).toHaveLength(115);
    expect(listing.sections.filter((s) => s.instructor === null)).toHaveLength(55);
    expect(listing.sections.filter((s) => s.location === null)).toHaveLength(131);
  });
});

const PERIOD_PICKER = `
  <select id="academicPeriod" data-selected-id="LSUAM_FALL_2026">
    <option value="LSUAM_FALL_2026">Fall Semester 2026 (08/24/2026-12/12/2026)</option>
  </select>`;

function sectionHtml({
  label = "Section 001-LEC",
  enrollment = "Enrollment: 10/20",
  meeting = "<span>Monday Wednesday 9:00 AM - 9:50 AM</span>",
} = {}): string {
  return `
    <section aria-label="${label}">
      <span>${label}</span><span>${enrollment}</span>
      <div class="mb-3"><span>Meeting Pattern:<br/>${meeting}</span></div>
      <div class="mb-3"><span>3 Credit Hours</span></div>
      <div class="mb-3"><span>Location: Room 1</span></div>
      <div class="mb-3"><span>Instructor: A. Person</span></div>
      <div class="small">Delivery Mode: On Campus</div>
    </section>`;
}

function courseHtml(code: string, sections: string): string {
  return `
    <div class="course-accordion">
      <button class="accordion-button" aria-label="Expand course details for ${code}"></button>
      <div class="accordion-body">${sections}</div>
    </div>`;
}

const page = (body: string, picker = PERIOD_PICKER) => `<html><body>${picker}${body}</body></html>`;

describe("parseSectionListing on synthetic pages", () => {
  it("accepts a valid selected-period page with no course blocks", () => {
    expect(parseSectionListing(page("")).sections).toEqual([]);
  });

  it("parses a minimal page", () => {
    const result = parseSectionListing(page(courseHtml("CSC 1350", sectionHtml())));
    expect(result.sections).toEqual([
      expect.objectContaining({
        courseCode: "CSC 1350",
        meetings: [{ days: ["Mon", "Wed"], startMinute: 540, endMinute: 590 }],
      }),
    ]);
  });

  it("keeps a two-letter course code suffix", () => {
    // Seen live in the Online Second Fall 2026 period (T-403).
    const result = parseSectionListing(page(courseHtml("CSC 4890GE", sectionHtml())));
    expect(result.sections[0]?.courseCode).toBe("CSC 4890GE");
  });

  it("converts 12 AM and 12 PM correctly", () => {
    const html = page(
      courseHtml("CSC 1350", sectionHtml({ meeting: "<span>Friday 12:00 AM - 12:30 PM</span>" })),
    );
    expect(parseSectionListing(html).sections[0]?.meetings).toEqual([
      { days: ["Fri"], startMinute: 0, endMinute: 750 },
    ]);
  });

  it.each([
    ["no period picker", page(courseHtml("CSC 1350", sectionHtml()), "")],
    [
      "a selected period that isn't an option",
      page(
        courseHtml("CSC 1350", sectionHtml()),
        PERIOD_PICKER.replace('data-selected-id="LSUAM_FALL_2026"', 'data-selected-id="X_2027"'),
      ),
    ],
    ["a course with no sections", page(courseHtml("CSC 1350", ""))],
    ["an unrecognized course heading", page(courseHtml("Computer Science I", sectionHtml()))],
    [
      "an unrecognized section label",
      page(courseHtml("CSC 1350", sectionHtml({ label: "Section A1" }))),
    ],
    ["a missing enrollment", page(courseHtml("CSC 1350", sectionHtml({ enrollment: "" })))],
    [
      "an unrecognized meeting pattern",
      page(courseHtml("CSC 1350", sectionHtml({ meeting: "<span>MWF 9-10</span>" }))),
    ],
    [
      "a meeting that ends before it starts",
      page(
        courseHtml("CSC 1350", sectionHtml({ meeting: "<span>Monday 10:00 AM - 9:00 AM</span>" })),
      ),
    ],
    [
      "a repeated course block that differs",
      page(
        courseHtml("CSC 1350", sectionHtml()) +
          courseHtml("CSC 1350", sectionHtml({ enrollment: "Enrollment: 11/20" })),
      ),
    ],
  ])("throws SectionShapeError for %s", (_label, html) => {
    expect(() => parseSectionListing(html)).toThrow(SectionShapeError);
  });
});
describe("parseAcademicPeriods", () => {
  it("reads the periods from a listing page", () => {
    expect(parseAcademicPeriods(readFileSync(FIXTURE, "utf8"))).toEqual(listing.periods);
  });

  it("reads the periods from the landing page, where none is selected and no sections show", () => {
    const landing = page(
      "",
      PERIOD_PICKER.replace('data-selected-id="LSUAM_FALL_2026"', 'data-selected-id=""'),
    );
    expect(parseAcademicPeriods(landing)).toEqual([
      {
        id: "LSUAM_FALL_2026",
        label: "Fall Semester 2026",
        startDate: "2026-08-24",
        endDate: "2026-12-12",
      },
    ]);
  });

  it.each([
    ["no period picker", page("", "")],
    ["an empty picker", page("", '<select id="academicPeriod" data-selected-id=""></select>')],
    [
      "an option without dates",
      page(
        "",
        '<select id="academicPeriod"><option value="LSUAM_FALL_2026">Fall</option></select>',
      ),
    ],
  ])("throws SectionShapeError for %s", (_label, html) => {
    expect(() => parseAcademicPeriods(html)).toThrow(SectionShapeError);
  });
});
