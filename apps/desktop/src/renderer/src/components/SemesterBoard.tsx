import { useState } from "react";
import {
  type CompletedInput,
  type CourseCode,
  type CourseOfferingHistory,
  type Plan,
  type PlanValidationIssue,
  type Season,
  type ValidationPlan,
  typicalTerms,
} from "@jevschedule/shared";
import { plannerTools } from "../services/plannerTools.js";

export interface SemesterBoardProps {
  plan: Plan;
  onMoveCourse: (
    sourceTermIndex: number,
    sourceCourseIndex: number,
    destTermIndex: number,
    destCourseIndex: number,
  ) => void;
  onRemoveCourse?: (termIndex: number, code: CourseCode) => void;
  onAddTerm?: (season: Season, year: number) => void;
  onRemoveTerm?: (termIndex: number) => void;
  /** Catalog data is required to check actual credits and prerequisites. */
  courseDetails?: ValidationPlan["courseDetails"];
  courseHistory?: Record<CourseCode, CourseOfferingHistory[]>;
  completed?: CompletedInput[] | Set<CourseCode>;
}

interface DraggedCourseData {
  sourceTermIndex: number;
  sourceCourseIndex: number;
  code: CourseCode;
}

export function SemesterBoard({
  plan,
  onMoveCourse,
  onRemoveCourse,
  onAddTerm,
  onRemoveTerm,
  courseDetails,
  courseHistory,
  completed = [],
}: SemesterBoardProps) {
  const [dragData, setDragData] = useState<DraggedCourseData | null>(null);
  const [newSeason, setNewSeason] = useState<Season>("Fall");
  const [newYear, setNewYear] = useState<number>(2027);
  const validation = courseDetails
    ? plannerTools.validatePlan({ ...plan, courseDetails }, completed)
    : null;

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    termIndex: number,
    courseIndex: number,
    code: CourseCode,
  ) => {
    const data: DraggedCourseData = {
      sourceTermIndex: termIndex,
      sourceCourseIndex: courseIndex,
      code,
    };
    setDragData(data);
    e.dataTransfer.setData("application/json", JSON.stringify(data));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    destTermIndex: number,
    destCourseIndex?: number,
  ) => {
    e.preventDefault();
    let data = dragData;

    if (!data) {
      try {
        const raw = e.dataTransfer.getData("application/json");
        if (raw) {
          data = JSON.parse(raw) as DraggedCourseData;
        }
      } catch {
        // ignore parse error
      }
    }

    if (!data) return;

    const targetPos =
      destCourseIndex !== undefined
        ? destCourseIndex
        : (plan.terms[destTermIndex]?.courses.length ?? 0);

    onMoveCourse(data.sourceTermIndex, data.sourceCourseIndex, destTermIndex, targetPos);
    setDragData(null);
  };

  const handleAddTermSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onAddTerm) {
      onAddTerm(newSeason, newYear);
    }
  };

  return (
    <div className="semester-board-container" data-testid="semester-board">
      <header className="board-header">
        <h2>Semester-by-Semester Plan</h2>
        <p className="credit-limit-info">
          Credit limit per semester: <strong>{plan.creditLimit} hrs</strong>
        </p>
      </header>

      <div className="terms-grid" data-testid="terms-grid">
        {plan.terms.map((term, termIndex) => {
          const issues =
            validation?.issues.filter(
              (issue) => issue.term.season === term.season && issue.term.year === term.year,
            ) ?? [];
          const creditIssue = issues.find(
            (issue): issue is Extract<PlanValidationIssue, { type: "credit_limit" }> =>
              issue.type === "credit_limit",
          );
          const knownCredits = term.courses.reduce(
            (sum, code) => sum + (courseDetails?.[code]?.credits.max ?? 0),
            0,
          );
          const missingCredits = courseDetails
            ? term.courses.some((code) => !courseDetails[code])
            : term.courses.length > 0;
          const isOverLimit = creditIssue !== undefined;

          return (
            <div
              key={`${term.season}-${term.year}-${termIndex}`}
              className={`term-column ${isOverLimit ? "over-limit" : ""}`}
              data-testid={`term-column-${termIndex}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, termIndex)}
            >
              <div className="term-header">
                <h3>
                  {term.season} {term.year}
                </h3>
                <span
                  className={`term-credits-badge ${isOverLimit ? "badge-danger" : ""}`}
                  data-testid={`term-credits-${termIndex}`}
                >
                  {courseDetails ? `${knownCredits}${missingCredits ? "+" : ""}` : "?"} /{" "}
                  {plan.creditLimit} cr
                </span>
                {onRemoveTerm && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => onRemoveTerm(termIndex)}
                    aria-label={`Remove ${term.season} ${term.year} term`}
                  >
                    ×
                  </button>
                )}
              </div>

              {creditIssue && (
                <p role="alert" className="limit-warning">
                  {creditIssue.credits} credits exceed the {plan.creditLimit}-credit limit.
                </p>
              )}

              <div className="courses-list" data-testid={`term-courses-${termIndex}`}>
                {term.courses.length === 0 ? (
                  <p className="empty-term-message">Drag courses here</p>
                ) : (
                  term.courses.map((code, courseIndex) => {
                    const courseIssues = issues.filter(
                      (issue) => "courseCode" in issue && issue.courseCode === code,
                    );
                    const history = courseHistory?.[code] ?? [];
                    const offeredSeasons: string[] = typicalTerms(history).map(
                      ({ season }) => season,
                    );
                    const isAtypicallyOffered =
                      history.length > 0 && !offeredSeasons.includes(term.season);
                    return (
                      <div
                        key={`${code}-${courseIndex}`}
                        className="course-card"
                        data-testid={`course-card-${code}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, termIndex, courseIndex, code)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, termIndex, courseIndex)}
                      >
                        <div className="course-card-body">
                          <span className="drag-handle" aria-hidden="true">
                            ⋮⋮
                          </span>
                          <span className="course-code-text">{code}</span>
                        </div>
                        {courseIssues.map((issue) => (
                          <p
                            role={issue.type === "prerequisite_warning" ? "status" : "alert"}
                            className={
                              issue.type === "prerequisite_warning"
                                ? "course-validation-warning"
                                : "course-validation-error"
                            }
                            key={issue.type}
                          >
                            {issue.type === "missing_course"
                              ? "Catalog data unavailable for this course."
                              : issue.type === "prerequisite"
                                ? `Missing prerequisite: ${issue.missingPrerequisites.join(", ")}`
                                : issue.type === "prerequisite_warning"
                                  ? issue.message
                                  : null}
                          </p>
                        ))}
                        {isAtypicallyOffered && (
                          <p className="course-validation-warning">
                            Not offered in {term.season} terms so far (seen:{" "}
                            {offeredSeasons.join(", ")}).
                          </p>
                        )}

                        <div className="course-card-actions">
                          {termIndex > 0 && (
                            <button
                              type="button"
                              className="btn btn-xs"
                              onClick={() =>
                                onMoveCourse(
                                  termIndex,
                                  courseIndex,
                                  termIndex - 1,
                                  plan.terms[termIndex - 1]?.courses.length ?? 0,
                                )
                              }
                              aria-label={`Move ${code} left to ${plan.terms[termIndex - 1]?.season}`}
                            >
                              ← Move
                            </button>
                          )}

                          {termIndex < plan.terms.length - 1 && (
                            <button
                              type="button"
                              className="btn btn-xs"
                              onClick={() =>
                                onMoveCourse(
                                  termIndex,
                                  courseIndex,
                                  termIndex + 1,
                                  plan.terms[termIndex + 1]?.courses.length ?? 0,
                                )
                              }
                              aria-label={`Move ${code} right to ${plan.terms[termIndex + 1]?.season}`}
                            >
                              Move →
                            </button>
                          )}

                          {onRemoveCourse && (
                            <button
                              type="button"
                              className="btn btn-xs btn-remove"
                              onClick={() => onRemoveCourse(termIndex, code)}
                              aria-label={`Remove ${code} from ${term.season} ${term.year}`}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {onAddTerm && (
        <form className="add-term-form" onSubmit={handleAddTermSubmit}>
          <h4>Add New Term</h4>
          <div className="form-inline">
            <select
              value={newSeason}
              onChange={(e) => setNewSeason(e.target.value as Season)}
              aria-label="Select Season"
            >
              <option value="Fall">Fall</option>
              <option value="Spring">Spring</option>
              <option value="Summer">Summer</option>
              <option value="Winter">Winter</option>
            </select>
            <input
              type="number"
              value={newYear}
              onChange={(e) => setNewYear(Number(e.target.value))}
              aria-label="Enter Year"
              min={2020}
              max={2035}
            />
            <button type="submit" className="btn btn-primary" data-testid="add-term-btn">
              Add Term
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
