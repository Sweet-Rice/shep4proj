import { useEffect, useMemo, useRef, useState } from "react";
import {
  termToPeriodId,
  type AcademicPeriodId,
  type CourseCode,
  type Season,
  type Section,
} from "@jevschedule/shared";
import { useCatalogCourses } from "../hooks/useCatalog.js";
import { usePlan } from "../hooks/usePlan.js";
import { getSectionKey, useScheduleBuilder } from "../hooks/useScheduleBuilder.js";
import { useSections } from "../hooks/useSections.js";
import { matchesCourseQuery } from "./courseFilter.js";
import { CourseSearch } from "./CourseSearch.js";
import { SectionList } from "./SectionList.js";
import { WeeklyCalendar, formatMinuteToTime } from "./WeeklyCalendar.js";

/** Academic-year order within a calendar year; unlike `validatePlan`, Winter follows Fall. */
const SEASON_ORDER: Record<Season, number> = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };

const SERVER_ALERT =
  "Couldn't reach the JevSchedule server. It may be waking up, which can take up to a minute. Try again.";

export function ScheduleScreen() {
  const { plan } = usePlan();
  const { courses, error: catalogError } = useCatalogCourses();
  const [selectedTerm, setSelectedTerm] = useState<AcademicPeriodId | "">("");
  // The one course whose sections are listed; picking another course replaces it.
  const [activeCourse, setActiveCourse] = useState<CourseCode | null>(null);
  // The calendar section whose details/removal panel is open.
  const [inspectedKey, setInspectedKey] = useState<string | null>(null);
  const terms = useMemo(
    () =>
      plan.terms
        .map((planTerm) => ({ ...planTerm, periodId: termToPeriodId(planTerm) }))
        .sort((a, b) => a.year - b.year || SEASON_ORDER[a.season] - SEASON_ORDER[b.season]),
    [plan.terms],
  );
  const current = terms.find(({ periodId }) => periodId === selectedTerm) ?? terms[0];
  const term = current?.periodId ?? null;
  const activeCodes = useMemo(() => (activeCourse ? [activeCourse] : []), [activeCourse]);
  const { sectionsByCourse, loading, error } = useSections(activeCodes, term);
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
  const scheduledCodes = useMemo(
    () => new Set(termSections.map((section) => section.courseCode)),
    [termSections],
  );
  const inspected = termSections.find((section) => getSectionKey(section) === inspectedKey);
  const titleByCode = useMemo(
    () => new Map(courses.map((course) => [course.code, course.title])),
    [courses],
  );

  // Section counts per "term|code" from each term's Course Offerings listing. There is no
  // endpoint listing a term's offerings, so the catalog is scanned course by course, putting
  // courses that match the current search first. -1 marks a failed lookup.
  const offeredRef = useRef<Record<string, number>>({});
  const queryRef = useRef("");
  const [checkedCount, setCheckedCount] = useState(0);
  useEffect(() => {
    if (!term || courses.length === 0) return;
    let cancelled = false;
    const inFlight = new Set<string>();
    const pending = (code: CourseCode) =>
      !(`${term}|${code}` in offeredRef.current) && !inFlight.has(code);
    const nextCode = () => {
      const query = queryRef.current;
      const match = query.trim()
        ? courses.find((course) => pending(course.code) && matchesCourseQuery(course, query))
        : undefined;
      return (match ?? courses.find((course) => pending(course.code)))?.code;
    };
    const countChecked = () =>
      courses.filter((course) => `${term}|${course.code}` in offeredRef.current).length;
    const worker = async () => {
      for (let code = nextCode(); code && !cancelled; code = nextCode()) {
        inFlight.add(code);
        let count = -1;
        try {
          count = (await window.jevschedule.catalog.listSections(code, term)).length;
        } catch {
          // Keep it listed; picking it shows the server error.
        }
        inFlight.delete(code);
        offeredRef.current[`${term}|${code}`] = count;
      }
    };
    setCheckedCount(countChecked());
    const tick = setInterval(() => setCheckedCount(countChecked()), 400);
    void Promise.all(Array.from({ length: 10 }, worker)).then(() => {
      clearInterval(tick);
      if (!cancelled) setCheckedCount(countChecked());
    });
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [courses, term]);
  const offeredCourses = useMemo(
    () =>
      courses.filter((course) => {
        const count = offeredRef.current[`${term}|${course.code}`];
        return count !== undefined && count !== 0;
      }),
    // checkedCount changes as the scan fills offeredRef.
    [courses, term, checkedCount],
  );
  const scanning = courses.length > 0 && checkedCount < courses.length;

  const removeInspected = (section: Section) => {
    builder.removeSection(getSectionKey(section));
    setInspectedKey(null);
  };

  return (
    <main className="schedule-screen">
      <header className="page-header">
        <h1>Schedule</h1>
        <p className="page-subtitle">
          Find courses offered this term, add sections, and check for overlaps. Click a class on the
          calendar to see its details or remove it.
        </p>
      </header>
      {terms.length === 0 ? (
        <p className="empty-state">Add a term in the Plan tab to build a schedule.</p>
      ) : (
        <>
          <div className="schedule-term-bar">
            <label className="field schedule-term-field">
              <span className="field-label">Term</span>
              <select
                aria-label="Term"
                value={term ?? ""}
                onChange={(event) => {
                  setSelectedTerm(event.currentTarget.value as AcademicPeriodId);
                  setActiveCourse(null);
                  setInspectedKey(null);
                }}
              >
                {terms.map(({ season, year, periodId }) => (
                  <option key={periodId} value={periodId}>
                    {season} {year}
                  </option>
                ))}
              </select>
            </label>
            {current && current.courses.length > 0 && (
              <div className="schedule-plan-chips" aria-label="Courses in your plan for this term">
                <span className="field-label">From your plan</span>
                <div>
                  {current.courses.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={`btn btn-sm ${activeCourse === code ? "btn-primary" : "btn-secondary"}`}
                      aria-pressed={activeCourse === code}
                      onClick={() => setActiveCourse(code)}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="schedule-layout">
            <div className="schedule-sidebar">
              <section className="card schedule-catalog" aria-label="Course catalog">
                {scanning && (
                  <p className="schedule-scan-status">
                    Finding {current ? `${current.season} ${current.year}` : ""} offerings…{" "}
                    {checkedCount} of {courses.length} courses checked
                  </p>
                )}
                <CourseSearch
                  key={term}
                  courses={offeredCourses}
                  selectLabel="Add course"
                  selectedCodes={scheduledCodes}
                  onSelectCourse={(course) => setActiveCourse(course.code)}
                  onQueryChange={(query) => {
                    // A new search hides the previous course's sections.
                    if (query !== queryRef.current) setActiveCourse(null);
                    queryRef.current = query;
                  }}
                />
              </section>
              {loading && <p role="status">Loading sections…</p>}
              {(error || catalogError) && <p role="alert">{SERVER_ALERT}</p>}
              {activeCourse && !loading && !error && (
                <SectionList
                  key={`${term}:${activeCourse}`}
                  courseCode={activeCourse}
                  term={term ?? undefined}
                  sections={sectionsByCourse[activeCourse] ?? []}
                  scheduledSections={termSections}
                  onAddSection={builder.addSection}
                  onRemoveCourse={() => setActiveCourse(null)}
                />
              )}
            </div>
            <div className="schedule-calendar">
              {inspected && (
                <section
                  className={`card schedule-inspect ${termConflicts.has(getSectionKey(inspected)) ? "conflict" : ""}`}
                  aria-label={`${inspected.courseCode} ${inspected.sectionNumber} details`}
                >
                  <div className="schedule-inspect-heading">
                    <h2>
                      {inspected.courseCode} · {inspected.sectionNumber}-{inspected.sectionType}
                    </h2>
                    <span className="muted">{titleByCode.get(inspected.courseCode)}</span>
                  </div>
                  <ul className="schedule-inspect-meta">
                    {inspected.meetings.map((meeting, index) => (
                      <li key={index}>
                        {meeting.days.join(", ")} {formatMinuteToTime(meeting.startMinute)}–
                        {formatMinuteToTime(meeting.endMinute)}
                      </li>
                    ))}
                    <li>{inspected.instructor ?? "Instructor TBA"}</li>
                    <li>{inspected.location ?? "Location TBA"}</li>
                    <li>
                      {inspected.credits.min === inspected.credits.max
                        ? `${inspected.credits.min} credits`
                        : `${inspected.credits.min}–${inspected.credits.max} credits`}
                    </li>
                  </ul>
                  {termConflicts.has(getSectionKey(inspected)) && (
                    <p className="section-list-conflict">
                      This section overlaps another class on your schedule.
                    </p>
                  )}
                  <p>Remove this section from your schedule?</p>
                  <div className="schedule-inspect-actions">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeInspected(inspected)}
                    >
                      Remove from schedule
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setInspectedKey(null)}
                    >
                      Keep
                    </button>
                  </div>
                </section>
              )}
              <WeeklyCalendar
                sections={termSections}
                conflictingSectionKeys={termConflicts}
                onSelectSection={(section) => setInspectedKey(getSectionKey(section))}
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
