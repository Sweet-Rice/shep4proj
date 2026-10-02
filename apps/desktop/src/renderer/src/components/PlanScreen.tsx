import { useEffect, useMemo, useState } from "react";
import type { CourseCode } from "@jevschedule/shared";
import { useCatalogCourses, useCourseDetails, useCourseHistory } from "../hooks/useCatalog.js";
import { useCompletedCourses } from "../hooks/useCompletedCourses.js";
import { usePlan } from "../hooks/usePlan.js";
import { matchesCourseQuery } from "./courseFilter.js";
import { SemesterBoard } from "./SemesterBoard.js";

const termKey = (term: { season: string; year: number }) => `${term.season}-${term.year}`;

/** Strips Electron's IPC wrapper and zod JSON so "duplicate term: Fall 2026" is what shows. */
function readableError(error: Error): string {
  const message = error.message.replace(
    /^Error invoking remote method '[^']+': (?:\w*Error: )?/,
    "",
  );
  const issues = [...message.matchAll(/"message":\s*"([^"]+)"/g)].map((match) => match[1]);
  return issues.length > 0 ? issues.join("; ") : message;
}

export function PlanScreen() {
  const {
    plan,
    loaded,
    saving,
    error: planError,
    moveCourse,
    addCourseToTerm,
    removeCourseFromTerm,
    addTerm,
    removeTerm,
    savePlan,
  } = usePlan();
  const { completed } = useCompletedCourses();
  const { courses, loading: catalogLoading, error: catalogError } = useCatalogCourses();
  const plannedCodes = useMemo(() => plan.terms.flatMap((term) => term.courses), [plan.terms]);
  const { details } = useCourseDetails(plannedCodes);
  const { history: courseHistory } = useCourseHistory(plannedCodes);
  const [creditLimitInput, setCreditLimitInput] = useState(String(plan.creditLimit));
  const [creditLimitError, setCreditLimitError] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseCode | "">("");
  const [courseQuery, setCourseQuery] = useState("");
  const [selectedTermKey, setSelectedTermKey] = useState("");
  const editable = loaded && !saving;

  useEffect(() => {
    setCreditLimitInput(String(plan.creditLimit));
  }, [plan.creditLimit]);
  useEffect(() => {
    if (selectedTermKey && !plan.terms.some((term) => termKey(term) === selectedTermKey)) {
      setSelectedTermKey("");
    } else if (!selectedTermKey && plan.terms[0]) {
      // Default to the first term so adding a course doesn't need an extra pick.
      setSelectedTermKey(termKey(plan.terms[0]));
    }
  }, [plan.terms, selectedTermKey]);

  const planned = new Set(plannedCodes);
  const availableCourses = courses
    .filter((course) => !planned.has(course.code) && matchesCourseQuery(course, courseQuery))
    .sort((a, b) => a.code.localeCompare(b.code));
  const selectedTermIndex = plan.terms.findIndex((term) => termKey(term) === selectedTermKey);

  const commitCreditLimit = () => {
    if (!editable) return;
    const parsed = Number(creditLimitInput);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setCreditLimitInput(String(plan.creditLimit));
      setCreditLimitError(true);
      return;
    }
    setCreditLimitError(false);
    if (parsed !== plan.creditLimit) {
      void savePlan({ ...plan, creditLimit: parsed }).catch(() => {});
    }
  };

  const addSelectedCourse = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !editable ||
      catalogError ||
      catalogLoading ||
      selectedTermIndex < 0 ||
      selectedCourse === ""
    ) {
      return;
    }
    void addCourseToTerm(selectedTermIndex, selectedCourse).catch(() => {});
    setSelectedCourse("");
    setCourseQuery("");
  };

  return (
    <main className="plan-screen">
      <header className="page-header">
        <h1>Plan</h1>
        <p className="page-subtitle">
          Lay out your remaining semesters and keep each term within your credit limit.
        </p>
      </header>
      {catalogError && (
        <p role="alert">
          {catalogError.message}. Start the server to add courses and check prerequisites.
        </p>
      )}
      {planError && <p role="alert">Could not save the plan: {readableError(planError)}</p>}

      <div className="toolbar plan-toolbar">
        <form className="add-course-to-plan-form" onSubmit={addSelectedCourse}>
          <label className="field">
            <span className="field-label">Find a course</span>
            <input
              type="search"
              aria-label="Search courses to plan"
              placeholder="Code or title, e.g. CSC 3380"
              value={courseQuery}
              disabled={!editable || catalogLoading || Boolean(catalogError)}
              onChange={(event) => {
                const query = event.currentTarget.value;
                setCourseQuery(query);
                const matches = courses.filter(
                  (course) => !planned.has(course.code) && matchesCourseQuery(course, query),
                );
                setSelectedCourse(matches.length === 1 && matches[0] ? matches[0].code : "");
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">
              Course
              {courseQuery.trim()
                ? ` (${availableCourses.length} ${availableCourses.length === 1 ? "match" : "matches"})`
                : ""}
            </span>
            <select
              aria-label="Course"
              value={selectedCourse}
              onChange={(event) => setSelectedCourse(event.target.value as CourseCode | "")}
              disabled={!editable || catalogLoading || Boolean(catalogError)}
            >
              <option value="">
                {availableCourses.length === 0 ? "No matching courses" : "Select a course"}
              </option>
              {availableCourses.map((course) => (
                <option key={course.code} value={course.code}>
                  {course.code} — {course.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Term</span>
            <select
              aria-label="Term"
              value={selectedTermKey}
              onChange={(event) => setSelectedTermKey(event.target.value)}
              disabled={!editable || plan.terms.length === 0}
            >
              <option value="">Select a term</option>
              {plan.terms.map((term) => (
                <option key={termKey(term)} value={termKey(term)}>
                  {term.season} {term.year}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={
              !editable ||
              catalogLoading ||
              Boolean(catalogError) ||
              plan.terms.length === 0 ||
              selectedCourse === "" ||
              selectedTermKey === ""
            }
          >
            Add to plan
          </button>
        </form>
        <div className="credit-limit-control field">
          <label htmlFor="credit-limit">Credit limit per semester</label>
          <input
            id="credit-limit"
            type="number"
            min={1}
            step={1}
            disabled={!editable}
            value={creditLimitInput}
            onChange={(event) => setCreditLimitInput(event.target.value)}
            onBlur={commitCreditLimit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>
      {creditLimitError && <p role="alert">Enter a whole number of credits (1 or more).</p>}

      {loaded && (
        <SemesterBoard
          plan={plan}
          courseHistory={courseHistory}
          onMoveCourse={(sourceTermIndex, sourceCourseIndex, destTermIndex, destCourseIndex) => {
            void moveCourse(
              sourceTermIndex,
              sourceCourseIndex,
              destTermIndex,
              destCourseIndex,
            ).catch(() => {});
          }}
          onRemoveCourse={(termIndex, code) => {
            void removeCourseFromTerm(termIndex, code).catch(() => {});
          }}
          onAddTerm={(season, year) => {
            void addTerm(season, year).catch(() => {});
          }}
          onRemoveTerm={(termIndex) => {
            void removeTerm(termIndex).catch(() => {});
          }}
          courseDetails={details}
          completed={completed}
        />
      )}
    </main>
  );
}
