import type { StoredAcademicProgress } from "../../../shared/ipc.js";

const STATUS_BADGE_CLASS = {
  satisfied: "badge-success",
  "in-progress": "badge-warning",
  "not-satisfied": "badge-danger",
  unknown: "",
} as const;

function statusClass(status: string): string {
  if (status === "satisfied") return "satisfied";
  if (status === "in-progress") return "partially_satisfied";
  return status === "not-satisfied" ? "unsatisfied" : "unknown";
}

function formatImportedDate(importedAt: string): string {
  return new Date(importedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function WorkdayAcademicProgressView({ audit }: { audit: StoredAcademicProgress }) {
  const { overall, requirements } = audit.result;
  const total = overall.definedCredits ?? 0;
  const satisfying = overall.satisfyingCredits ?? 0;
  const inProgress = overall.inProgressCredits ?? 0;
  const percent =
    total > 0 ? Math.min(100, Math.max(0, Math.round((satisfying / total) * 100))) : 0;

  return (
    <div className="degree-progress-container" data-testid="workday-academic-progress">
      <header className="degree-header">
        <h2>From Workday · imported {formatImportedDate(audit.importedAt)}</h2>
        <div className="overall-status">
          <span className="status-badge in-progress">{overall.status ?? "Academic progress"}</span>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              role="progressbar"
              aria-label="Workday satisfying credits"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="credits-summary">
            {satisfying} of {total} satisfying credits · {inProgress} in progress
            {overall.remainingCredits === null ? "" : ` · ${overall.remainingCredits} remaining`}
          </span>
        </div>
      </header>
      <section className="requirements-list" aria-label="Workday degree requirements">
        {requirements.map((requirement, index) => {
          const status = statusClass(requirement.status);
          return (
            <details
              className={`area-card area-${status}`}
              data-testid={`workday-requirement-${index}`}
              key={`${requirement.name}-${index}`}
            >
              <summary className="area-summary">
                <span className="area-name">{requirement.name}</span>
                <span className={`badge ${STATUS_BADGE_CLASS[requirement.status]}`}>
                  {requirement.statusText}
                </span>
                {requirement.remaining ? (
                  <span className="area-count">Remaining: {requirement.remaining}</span>
                ) : null}
              </summary>
              <div className="area-details">
                <section
                  className="area-course-group"
                  aria-label={`Courses satisfying ${requirement.name}`}
                >
                  <h4>Satisfied with</h4>
                  {requirement.satisfiedWith.length === 0 ? (
                    <p className="area-empty">No satisfying courses listed.</p>
                  ) : (
                    <ul>
                      {requirement.satisfiedWith.map((course, courseIndex) => (
                        <li
                          className="area-course-completed"
                          key={`${course.code ?? course.text}-${courseIndex}`}
                        >
                          {course.code ? (
                            <span className="course-code-text">{course.code}</span>
                          ) : null}
                          {course.text}
                          {course.academicPeriod ? ` · ${course.academicPeriod}` : ""}
                          {course.creditHours === null ? "" : ` · ${course.creditHours} credits`}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
