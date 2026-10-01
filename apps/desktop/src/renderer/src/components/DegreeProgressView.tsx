import type { CourseCode, DegreeProgram } from "@jevschedule/shared";
import { useDegreeProgress } from "../hooks/useDegreeProgress.js";
import { CourseCompletionToggle } from "./CourseCompletionToggle.js";

export interface DegreeProgressViewProps {
  degree: DegreeProgram;
  completed: Set<CourseCode>;
  onToggleCourse: (code: CourseCode) => void;
  disabled?: boolean;
}

export function DegreeProgressView({
  degree,
  completed,
  onToggleCourse,
  disabled = false,
}: DegreeProgressViewProps) {
  const evaluation = useDegreeProgress(degree, completed);

  if (!evaluation) {
    return null;
  }

  const percentComplete = Math.round(
    (evaluation.totalCreditsFulfilled / evaluation.totalCreditsRequired) * 100,
  );

  return (
    <div className="degree-progress-container">
      <header className="degree-header">
        <h2>{degree.program}</h2>
        <p className="concentration">
          {degree.concentration} ({degree.catalogYear})
        </p>
        <div className="overall-status" data-testid="overall-status">
          <span className={`status-badge ${evaluation.isSatisfied ? "satisfied" : "in-progress"}`}>
            {evaluation.isSatisfied ? "Degree Satisfied" : "In Progress"}
          </span>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(100, percentComplete)}%` }}
              role="progressbar"
              aria-valuenow={percentComplete}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <span className="credits-summary" data-testid="credits-summary">
            {evaluation.totalCreditsFulfilled} / {evaluation.totalCreditsRequired} credits (
            {percentComplete}%)
          </span>
        </div>
      </header>

      <section className="requirements-list">
        <h3>Requirements</h3>
        {evaluation.requirements.map((req) => (
          <div
            key={req.id}
            className={`requirement-card requirement-${req.status}`}
            data-testid={`req-card-${req.id}`}
          >
            <div className="requirement-header">
              <h4>{req.label}</h4>
              <span
                className={`req-status-badge status-${req.status}`}
                data-testid={`req-status-${req.id}`}
              >
                {req.status === "satisfied"
                  ? "Satisfied"
                  : req.status === "partially_satisfied"
                    ? "Partially Satisfied"
                    : "Unsatisfied"}
              </span>
            </div>

            {req.kind === "fixed" && (
              <ul className="requirement-courses">
                {req.courses.map((courseRef) => (
                  <li key={courseRef.code} className="course-item">
                    <CourseCompletionToggle
                      courseId={courseRef.code}
                      isCompleted={completed.has(courseRef.code)}
                      onToggle={onToggleCourse}
                      label={
                        courseRef.minGrade
                          ? `${courseRef.code} (Min grade: ${courseRef.minGrade})`
                          : courseRef.code
                      }
                      disabled={disabled}
                    />
                  </li>
                ))}
              </ul>
            )}

            {req.kind === "chooseN" && (
              <div className="choose-n-details">
                <p className="choose-n-subtitle">
                  Pick {req.n} option{req.n > 1 ? "s" : ""} ({req.fulfilledOptions.length}/{req.n}{" "}
                  completed)
                </p>
                <ul className="requirement-courses">
                  {req.options.map((optionRef) => (
                    <li key={optionRef.code} className="course-item">
                      <CourseCompletionToggle
                        courseId={optionRef.code}
                        isCompleted={completed.has(optionRef.code)}
                        onToggle={onToggleCourse}
                        label={
                          optionRef.minGrade
                            ? `${optionRef.code} (Min grade: ${optionRef.minGrade})`
                            : optionRef.code
                        }
                        disabled={disabled}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {req.kind === "creditBucket" && (
              <div className="bucket-details">
                <p className="bucket-subtitle">
                  Category: {req.category} ({req.fulfilledCredits}/{req.credits} credits)
                </p>
                {req.eligibleCourses.length > 0 && (
                  <ul className="requirement-courses">
                    {req.eligibleCourses.map((eligibleRef) => (
                      <li key={eligibleRef.code} className="course-item">
                        <CourseCompletionToggle
                          courseId={eligibleRef.code}
                          isCompleted={completed.has(eligibleRef.code)}
                          onToggle={onToggleCourse}
                          label={eligibleRef.code}
                          disabled={disabled}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
