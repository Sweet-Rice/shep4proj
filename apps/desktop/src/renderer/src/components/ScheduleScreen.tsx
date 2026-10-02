import { useMemo, useState } from "react";
import {
  termToPeriodId,
  type AcademicPeriodId,
  type CourseCode,
  type Season,
} from "@jevschedule/shared";
import { useCatalogCourses } from "../hooks/useCatalog.js";
import { usePlan } from "../hooks/usePlan.js";
import { getSectionKey, useScheduleBuilder } from "../hooks/useScheduleBuilder.js";
import { useSections } from "../hooks/useSections.js";
import { SectionList } from "./SectionList.js";
import { WeeklyCalendar } from "./WeeklyCalendar.js";

/** Academic-year order within a calendar year; unlike `validatePlan`, Winter follows Fall. */
const SEASON_ORDER: Record<Season, number> = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };

export function ScheduleScreen() {
  const { plan } = usePlan();
  const { courses, error: catalogError } = useCatalogCourses();
  const [selectedTerm, setSelectedTerm] = useState<AcademicPeriodId | "">("");
  const [selectedCourse, setSelectedCourse] = useState<CourseCode | "">("");
  // The user's edits to the selected term's course list; discarded when the term changes, so
  // until then the plan's courses for that term are shown. Nothing is written back to the plan.
  const [edited, setEdited] = useState<{ term: AcademicPeriodId; codes: CourseCode[] } | null>(
    null,
  );
  const terms = useMemo(
    () =>
      plan.terms
        .map((planTerm) => ({ ...planTerm, periodId: termToPeriodId(planTerm) }))
        .sort((a, b) => a.year - b.year || SEASON_ORDER[a.season] - SEASON_ORDER[b.season]),
    [plan.terms],
  );
  const current = terms.find(({ periodId }) => periodId === selectedTerm) ?? terms[0];
  const term = current?.periodId ?? null;
  const courseCodes = edited?.term === term ? edited.codes : (current?.courses ?? []);
  const { sectionsByCourse, loading, error } = useSections(courseCodes, term);
  const builder = useScheduleBuilder();
  const termSections = useMemo(
    () => builder.sections.filter((section) => section.term === term),
    [builder.sections, term],
  );
  const termConflicts = useMemo(
    () =>
      new Set(
        termSections.map(getSectionKey).filter((sectionKey) => builder.conflicts.has(sectionKey)),
      ),
    [termSections, builder.conflicts],
  );
  const availableCourses = courses.filter((course) => !courseCodes.includes(course.code));

  function addCourse() {
    if (!term || !selectedCourse || courseCodes.includes(selectedCourse)) return;
    setEdited({ term, codes: [...courseCodes, selectedCourse] });
    setSelectedCourse("");
  }

  function removeCourse(code: CourseCode) {
    if (!term) return;
    setEdited({ term, codes: courseCodes.filter((courseCode) => courseCode !== code) });
  }

  return (
    <main className="schedule-screen">
      <h1>Schedule</h1>
      {terms.length === 0 ? (
        <p>Add a term in the Plan tab to build a schedule.</p>
      ) : (
        <>
          <label>
            Term
            <select
              aria-label="Term"
              value={term ?? ""}
              onChange={(event) => {
                setSelectedTerm(event.currentTarget.value as AcademicPeriodId);
                setEdited(null);
              }}
            >
              {terms.map(({ season, year, periodId }) => (
                <option key={periodId} value={periodId}>
                  {season} {year}
                </option>
              ))}
            </select>
          </label>
          <section aria-labelledby="schedule-courses-heading">
            <h2 id="schedule-courses-heading">Courses to schedule</h2>
            <label>
              Add course
              <select
                aria-label="Add course"
                value={selectedCourse}
                onChange={(event) =>
                  setSelectedCourse(event.currentTarget.value as CourseCode | "")
                }
              >
                <option value="">Select a course</option>
                {availableCourses.map((course) => (
                  <option key={course.code} value={course.code}>
                    {course.code} — {course.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={addCourse} disabled={!selectedCourse}>
              Add course
            </button>
            <ul>
              {courseCodes.map((code) => (
                <li key={code}>
                  <span>{code}</span>
                  <button type="button" onClick={() => removeCourse(code)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {loading && <p role="status">Loading sections…</p>}
          {(error || catalogError) && (
            <p role="alert">
              Could not reach the JevSchedule server. Start it with pnpm dev and reopen this tab.
            </p>
          )}
          {courseCodes.map((code) => (
            <SectionList
              key={`${term}:${code}`}
              courseCode={code}
              term={term ?? undefined}
              sections={sectionsByCourse[code] ?? []}
              onAddSection={builder.addSection}
            />
          ))}
          <WeeklyCalendar
            sections={termSections}
            conflictingSectionKeys={termConflicts}
            onRemoveSection={builder.removeSection}
          />
        </>
      )}
    </main>
  );
}
