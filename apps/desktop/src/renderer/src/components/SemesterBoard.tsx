import { useEffect, useState } from "react";
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

/** "One of: MATH 1022 completed or planned in the same term; or MATH 1023 …" → "One of: MATH 1022, MATH 1023". */
function compactPrereq(text: string): string {
  if (!text.startsWith("One of:")) return text;
  return text.replace(/ completed or planned in the same term/g, "").replace(/;\s*or\s+/g, ", ");
}

/** Suggests the regular term after the plan's latest one (Fall → Spring → Fall), skipping taken terms. */
function suggestNextTerm(
  terms: Plan["terms"],
  currentYear: number,
): { season: Season; year: number } {
  const order: Record<Season, number> = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };
  const latest = [...terms].sort((a, b) => b.year - a.year || order[b.season] - order[a.season])[0];
  if (!latest) return { season: "Fall", year: currentYear };
  return latest.season === "Spring"
    ? { season: "Fall", year: latest.year }
    : latest.season === "Summer"
      ? { season: "Fall", year: latest.year }
      : { season: "Spring", year: latest.year + 1 };
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
  const currentYear = new Date().getFullYear();
  const [dragData, setDragData] = useState<DraggedCourseData | null>(null);
  const [dragOverTerm, setDragOverTerm] = useState<number | null>(null);
  const suggested = suggestNextTerm(plan.terms, currentYear);
  const [newSeason, setNewSeason] = useState<Season>(suggested.season);
  const [newYear, setNewYear] = useState<number>(suggested.year);
  const termCount = plan.terms.length;
  // After a term is added or removed, move the form on to the next sensible term.
  useEffect(() => {
    const next = suggestNextTerm(plan.terms, currentYear);
    setNewSeason(next.season);
    setNewYear(next.year);
  }, [termCount]);
  const termExists = plan.terms.some((term) => term.season === newSeason && term.year === newYear);
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

  const handleDragEnd = () => {
    setDragOverTerm(null);
    setDragData(null);
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
    setDragOverTerm(null);
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
    if (termExists) return;
    if (onAddTerm) {
      onAddTerm(newSeason, newYear);
    }
  };

  return (
    <div className="semester-board-container" data-testid="semester-board">
      <header className="board-header">
        <h2>Semester-by-Semester Plan</h2>
      </header>

      {plan.terms.length === 0 && (
        <div className="empty-state">
          <h3>No terms yet</h3>
          <p>Add a term to start placing courses.</p>
        </div>
      )}

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
          const fillPct = Math.min(100, Math.round((knownCredits / plan.creditLimit) * 100));
          const meterState = isOverLimit
            ? "danger"
            : knownCredits >= plan.creditLimit
              ? "warning"
              : "ok";

          return (
            <div
              key={`${term.season}-${term.year}-${termIndex}`}
              className={`term-column ${isOverLimit ? "over-limit" : ""} ${
                dragOverTerm === termIndex ? "drop-target" : ""
              }`}
              data-testid={`term-column-${termIndex}`}
              onDragOver={(e) => {
                handleDragOver(e);
                setDragOverTerm(termIndex);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDragOverTerm(null);
                }
              }}
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
                    className="btn btn-icon btn-ghost btn-remove-term"
                    onClick={() => onRemoveTerm(termIndex)}
                    aria-label={`Remove ${term.season} ${term.year} term`}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className={`term-meter term-meter-${meterState}`} aria-hidden="true">
                <span style={{ width: `${fillPct}%` }} />
              </div>

              {creditIssue && (
                <p role="alert" className="limit-warning">
                  {creditIssue.credits} credits exceed the {plan.creditLimit}-credit limit.
                </p>
              )}

              <div className="courses-list" data-testid={`term-courses-${termIndex}`}>
                {term.courses.length === 0 ? (
                  <p className="empty-term-message">Drag courses here or add one above</p>
                ) : (
                  term.courses.map((code, courseIndex) => {
                    const courseIssues = issues.filter(
                      (issue) => "courseCode" in issue && issue.courseCode === code,
                    );
                    const offeredSeasons: string[] = typicalTerms(courseHistory?.[code] ?? []).map(
                      ({ season }) => season,
                    );
                    const isAtypicallyOffered =
                      offeredSeasons.length > 0 && !offeredSeasons.includes(term.season);
                    return (
                      <div
                        key={`${code}-${courseIndex}`}
                        className="course-card"
                        data-testid={`course-card-${code}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, termIndex, courseIndex, code)}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, termIndex, courseIndex)}
                      >
                        <div className="course-card-body">
                          <span className="drag-handle" aria-hidden="true">
                            ⋮⋮
                          </span>
                          <span className="course-code-text">{code}</span>
                          {courseDetails?.[code] && (
                            <span className="course-credits">
                              {courseDetails[code].credits.max} cr
                            </span>
                          )}
                          {onRemoveCourse && (
                            <button
                              type="button"
                              className="btn btn-icon btn-xs btn-ghost btn-remove"
                              onClick={() => onRemoveCourse(termIndex, code)}
                              aria-label={`Remove ${code} from ${term.season} ${term.year}`}
                            >
                              ×
                            </button>
                          )}
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
                                ? `Missing prerequisite: ${issue.missingPrerequisites.map(compactPrereq).join(", ")}`
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
                              className="btn btn-xs btn-ghost"
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
                              ←
                            </button>
                          )}

                          {termIndex < plan.terms.length - 1 && (
                            <button
                              type="button"
                              className="btn btn-xs btn-ghost"
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
                              →
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
        {onAddTerm && (
          <form className="add-term-form term-column" onSubmit={handleAddTermSubmit}>
            <h3>Add New Term</h3>
            <div className="form-inline">
              <label className="field">
                <span className="field-label">Season</span>
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
              </label>
              <label className="field">
                <span className="field-label">Year</span>
                <input
                  type="number"
                  value={newYear}
                  onChange={(e) => setNewYear(Number(e.target.value))}
                  aria-label="Enter Year"
                  min={currentYear - 8}
                  max={currentYear + 8}
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="add-term-btn"
                disabled={termExists}
              >
                Add Term
              </button>
            </div>
            {termExists && (
              <p className="add-term-hint" role="status">
                {newSeason} {newYear} is already in your plan.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
