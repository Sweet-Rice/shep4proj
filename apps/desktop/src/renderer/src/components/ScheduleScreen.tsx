import { useMemo, useState } from "react";
import { termToPeriodId, type AcademicPeriodId, type CourseCode } from "@jevschedule/shared";
import { useCatalogCourses } from "../hooks/useCatalog.js";
import { usePlan } from "../hooks/usePlan.js";
import { useScheduleBuilder } from "../hooks/useScheduleBuilder.js";
import { useSections } from "../hooks/useSections.js";
import { SectionList } from "./SectionList.js";
import { WeeklyCalendar } from "./WeeklyCalendar.js";

export function ScheduleScreen() {
  const { plan } = usePlan();
  const { courses } = useCatalogCourses();
  const [selectedTerm, setSelectedTerm] = useState<AcademicPeriodId | "">("");
  const [selectedCourse, setSelectedCourse] = useState<CourseCode | "">("");
  const [courseCodes, setCourseCodes] = useState<CourseCode[]>([]);
  const terms = useMemo(
    () => plan.terms.map((term) => ({ ...term, periodId: termToPeriodId(term) })),
    [plan.terms],
  );
  const term =
    terms.find(({ periodId }) => periodId === selectedTerm)?.periodId ?? terms[0]?.periodId ?? null;
  const { sectionsByCourse, loading, error } = useSections(courseCodes, term);
  const builder = useScheduleBuilder();
  const availableCourses = courses.filter((course) => !courseCodes.includes(course.code));

  function addCourse() {
    if (!selectedCourse || courseCodes.includes(selectedCourse)) return;
    setCourseCodes((current) => [...current, selectedCourse]);
    setSelectedCourse("");
  }

  function removeCourse(code: CourseCode) {
    setCourseCodes((current) => current.filter((courseCode) => courseCode !== code));
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
              onChange={(event) => setSelectedTerm(event.currentTarget.value as AcademicPeriodId)}
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
          {error && (
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
            sections={builder.sections}
            conflictingSectionKeys={builder.conflicts}
            onRemoveSection={builder.removeSection}
          />
        </>
      )}
    </main>
  );
}
