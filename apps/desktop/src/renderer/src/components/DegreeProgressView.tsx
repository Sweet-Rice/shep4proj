import type { Course, CourseCode, DegreeProgram } from "@jevschedule/shared";
import { groupRequirementsByArea } from "@jevschedule/shared";
import { useDegreeProgress } from "../hooks/useDegreeProgress.js";
import { CourseCompletionToggle } from "./CourseCompletionToggle.js";
import { CreditHourTotalsView } from "./CreditHourTotalsView.js";

export interface DegreeProgressViewProps {
  degree: DegreeProgram;
  completed: Set<CourseCode>;
  onToggleCourse: (code: CourseCode) => void;
  disabled?: boolean;
  catalog?: Course[];
}

function statusLabel(status: string): string {
  return status === "satisfied"
    ? "Satisfied"
    : status === "partially_satisfied"
      ? "Partially satisfied"
      : "Unsatisfied";
}

function courseLabel(code: CourseCode, minGrade: string | null): string {
  return minGrade ? `${code} (Min grade: ${minGrade})` : code;
}

export function DegreeProgressView({
  degree,
  completed,
  onToggleCourse,
  catalog,
  disabled = false,
}: DegreeProgressViewProps) {
  const evaluation = useDegreeProgress(degree, completed, catalog);
  if (!evaluation) return null;

  const percentComplete = Math.round(
    (evaluation.totalCreditsFulfilled / evaluation.totalCreditsRequired) * 100,
  );
  const areas = groupRequirementsByArea(evaluation);

  return (
    <div className="degree-progress-container">
      <header className="degree-header">
        <h2>{degree.program}</h2>
        <p className="concentration">
          {degree.concentration} ({degree.catalogYear})
        </p>
        <div className="overall-status" data-testid="overall-status">
          <div className="overall-status-row">
            <span
              className={`status-badge ${evaluation.isSatisfied ? "satisfied" : "in-progress"}`}
            >
              {evaluation.isSatisfied ? "Degree Satisfied" : "In Progress"}
            </span>
            <span className="credits-summary" data-testid="credits-summary">
              {evaluation.totalCreditsFulfilled} / {evaluation.totalCreditsRequired} credits (
              {percentComplete}%)
            </span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(100, percentComplete)}%` }}
              role="progressbar"
              aria-label="Overall degree progress"
              aria-valuenow={percentComplete}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </header>
      <CreditHourTotalsView evaluation={evaluation} />
      <section className="requirements-list" aria-label="Degree requirement areas">
        {areas.map((area) => {
          const percent =
            area.required > 0
              ? Math.min(100, Math.round((area.fulfilled / area.required) * 100))
              : 0;
          const slug = area.area
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          return (
            <details
              key={area.area}
              className={`area-card area-${area.status}`}
              data-testid={`area-${slug}`}
            >
              <summary className="area-summary">
                <span className="area-name">{area.area}</span>
                <span className="area-progress-bar">
                  <span
                    className="area-progress-fill"
                    style={{ width: `${percent}%` }}
                    role="progressbar"
                    aria-label={`${area.area} progress`}
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </span>
                <span className="area-count">
                  {area.fulfilled} of {area.required} {area.unit}
                </span>
                <span className={`area-status status-${area.status}`}>
                  {statusLabel(area.status)}
                </span>
              </summary>
              <div className="area-details">
                {area.unit === "courses" ? (
                  <>
                    <section className="area-course-group">
                      <h4>Completed</h4>
                      {area.completed.length ? (
                        <ul>
                          {area.completed.map((course) => (
                            <li key={course.code} className="area-course-completed">
                              <CourseCompletionToggle
                                courseId={course.code}
                                isCompleted={completed.has(course.code)}
                                onToggle={onToggleCourse}
                                label={courseLabel(course.code, course.minGrade)}
                                disabled={disabled}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="area-empty">None yet</p>
                      )}
                    </section>
                    <section className="area-course-group">
                      <h4>Still required</h4>
                      {area.remaining.length || area.choices.length ? (
                        <ul>
                          {area.remaining.map((course) => (
                            <li key={course.code} className="area-course-remaining">
                              <CourseCompletionToggle
                                courseId={course.code}
                                isCompleted={completed.has(course.code)}
                                onToggle={onToggleCourse}
                                label={courseLabel(course.code, course.minGrade)}
                                disabled={disabled}
                              />
                            </li>
                          ))}
                          {area.choices.map((choice, index) => (
                            <li key={`choice-${index}`} className="area-choice">
                              <strong>Choose {choice.remaining} more from:</strong>
                              <ul>
                                {choice.options.map((course) => (
                                  <li key={course.code}>
                                    <CourseCompletionToggle
                                      courseId={course.code}
                                      isCompleted={completed.has(course.code)}
                                      onToggle={onToggleCourse}
                                      label={courseLabel(course.code, course.minGrade)}
                                      disabled={disabled}
                                    />
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="area-empty">None remaining</p>
                      )}
                    </section>
                  </>
                ) : (
                  area.slots.map((slot) => {
                    const stillRequired = slot.eligibleCourses.filter(
                      (course) => !slot.completed.some((done) => done.code === course.code),
                    );
                    return (
                      <section className="area-credit-slot" key={slot.category}>
                        <h4>
                          {slot.category}: {slot.fulfilledCredits} of {slot.requiredCredits} credits
                        </h4>
                        <section className="area-course-group">
                          <h5>Completed</h5>
                          {slot.completed.length ? (
                            <ul>
                              {slot.completed.map((course) => (
                                <li key={course.code} className="area-course-completed">
                                  <CourseCompletionToggle
                                    courseId={course.code}
                                    isCompleted={completed.has(course.code)}
                                    onToggle={onToggleCourse}
                                    label={courseLabel(course.code, course.minGrade)}
                                    disabled={disabled}
                                  />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="area-empty">None yet</p>
                          )}
                        </section>
                        <section className="area-course-group">
                          <h5>Still required</h5>
                          {stillRequired.length ? (
                            <ul>
                              {stillRequired.map((course) => (
                                <li key={course.code} className="area-course-remaining">
                                  <CourseCompletionToggle
                                    courseId={course.code}
                                    isCompleted={completed.has(course.code)}
                                    onToggle={onToggleCourse}
                                    label={courseLabel(course.code, course.minGrade)}
                                    disabled={disabled}
                                  />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="area-empty">Any course in this category</p>
                          )}
                        </section>
                      </section>
                    );
                  })
                )}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
