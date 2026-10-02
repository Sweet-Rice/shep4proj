import { useCatalogCourses } from "../hooks/useCatalog.js";
import { useCompletedCourses } from "../hooks/useCompletedCourses.js";
import { useDegree } from "../hooks/useDegree.js";
import { DegreeProgressView } from "./DegreeProgressView.js";

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

  return (
    <main className="degree-progress-screen">
      <h1>Degree Progress</h1>
      <p className="subtitle">Track your degree requirements and completion status in real-time.</p>

      {degreeError && (
        <p role="alert" className="error-message">
          Could not load the degree program from the server. Start it with pnpm dev and reopen this
          tab.
        </p>
      )}
      {completedError && (
        <p role="alert" className="error-message">
          Could not load or update completed courses. Please try again.
        </p>
      )}

      {degreeLoading || completedLoading ? (
        <p role="status">Loading degree progress…</p>
      ) : degreeError || !degree ? null : (
        <DegreeProgressView
          degree={degree}
          completed={completed}
          catalog={catalogError ? undefined : courses}
          onToggleCourse={(code) => {
            if (loaded) void toggleCourse(code);
          }}
        />
      )}
    </main>
  );
}
