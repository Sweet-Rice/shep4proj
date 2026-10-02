import { useEffect, useState } from "react";
import type { StoredAcademicProgress } from "../../../shared/ipc.js";
import { useCatalogCourses } from "../hooks/useCatalog.js";
import { useCompletedCourses } from "../hooks/useCompletedCourses.js";
import { useDegree } from "../hooks/useDegree.js";
import { DegreeProgressView } from "./DegreeProgressView.js";
import { WorkdayAcademicProgressView } from "./WorkdayAcademicProgressView.js";

export function DegreeProgressScreen() {
  const { degree, loading: degreeLoading, error: degreeError } = useDegree();
  const { courses, error: catalogError } = useCatalogCourses();
  const {
    completed,
    loaded,
    loading: completedLoading,
    error: completedError,
    toggleCourse,
  } = useCompletedCourses();
  const [audit, setAudit] = useState<StoredAcademicProgress | null>(null);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [showCatalogPlan, setShowCatalogPlan] = useState(false);

  useEffect(() => {
    let active = true;
    void window.jevschedule.academicProgress
      .getAudit()
      .then((stored) => {
        if (active) setAudit(stored);
      })
      .catch(() => {
        if (active) setAudit(null);
      })
      .finally(() => {
        if (active) setAuditLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const catalogView = degree ? (
    <DegreeProgressView
      degree={degree}
      completed={completed}
      catalog={catalogError ? undefined : courses}
      onToggleCourse={(code) => {
        if (loaded) void toggleCourse(code);
      }}
    />
  ) : null;

  return (
    <main className="degree-progress-screen">
      <header className="page-header">
        <h1>Degree Progress</h1>
        <p className="page-subtitle">
          {auditLoaded && !audit
            ? "Import from Workday to see your official degree audit."
            : "Track your degree requirements and completion status in real-time."}
        </p>
      </header>

      {degreeError && (
        <p role="alert" className="error-message">
          Couldn't reach the JevSchedule server to load the degree program. It may be waking up,
          which can take up to a minute. Try again.
        </p>
      )}
      {completedError && (
        <p role="alert" className="error-message">
          Could not load or update completed courses. Please try again.
        </p>
      )}

      {degreeLoading || completedLoading || !auditLoaded ? (
        <p role="status">Loading degree progress…</p>
      ) : degreeError || !degree ? null : (
        <>
          {audit && (
            <div className="degree-audit-toolbar" aria-label="Degree progress source">
              <button
                className="btn btn-secondary"
                aria-pressed={!showCatalogPlan}
                onClick={() => setShowCatalogPlan(false)}
              >
                Workday audit
              </button>
              <button
                className="btn btn-secondary"
                aria-pressed={showCatalogPlan}
                onClick={() => setShowCatalogPlan(true)}
              >
                {`Catalog plan (${degree.catalogYear} ${degree.concentration ?? degree.program})`}
              </button>
            </div>
          )}
          {audit && !showCatalogPlan ? <WorkdayAcademicProgressView audit={audit} /> : catalogView}
        </>
      )}
    </main>
  );
}
