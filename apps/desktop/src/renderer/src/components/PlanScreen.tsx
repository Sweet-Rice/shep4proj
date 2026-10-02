import { useEffect, useMemo, useState } from "react";
import type { CourseCode } from "@jevschedule/shared";
import { useCatalogCourses, useCourseDetails } from "../hooks/useCatalog.js";
import { useCompletedCourses } from "../hooks/useCompletedCourses.js";
import { usePlan } from "../hooks/usePlan.js";
import { SemesterBoard } from "./SemesterBoard.js";

const termKey = (term: { season: string; year: number }) => `${term.season}-${term.year}`;

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
  const [creditLimitInput, setCreditLimitInput] = useState(String(plan.creditLimit));
  const [creditLimitError, setCreditLimitError] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseCode | "">("");
  const [selectedTermKey, setSelectedTermKey] = useState("");
  const editable = loaded && !saving;

  useEffect(() => {
    setCreditLimitInput(String(plan.creditLimit));
  }, [plan.creditLimit]);
  useEffect(() => {
    if (selectedTermKey && !plan.terms.some((term) => termKey(term) === selectedTermKey)) {
      setSelectedTermKey("");
    }
  }, [plan.terms, selectedTermKey]);

  const planned = new Set(plannedCodes);
  const availableCourses = courses
    .filter((course) => !planned.has(course.code))
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
  };

  return (
    <main className="plan-screen">
      <h1>Plan</h1>
      {catalogError && (
        <p role="alert">
          Course catalog unavailable. Start the server to add courses and check prerequisites.
        </p>
      )}
      {planError && <p role="alert">Could not save the plan: {planError.message}</p>}

      <div className="credit-limit-control">
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
      {creditLimitError && <p role="alert">Enter a whole number of credits (1 or more).</p>}

      <form className="add-course-to-plan-form" onSubmit={addSelectedCourse}>
        <label>
          Course
          <select
            aria-label="Course"
            value={selectedCourse}
            onChange={(event) => setSelectedCourse(event.target.value as CourseCode | "")}
            disabled={!editable || catalogLoading || Boolean(catalogError)}
          >
            <option value="">Select a course</option>
            {availableCourses.map((course) => (
              <option key={course.code} value={course.code}>
                {course.code} — {course.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Term
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
      {plan.terms.length === 0 && <p>Add a term below to start placing courses.</p>}

      {loaded && (
        <SemesterBoard
          plan={plan}
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
