import { useState, type FormEvent } from "react";
import {
  CourseCodeSchema,
  getRequiredUnmetPrereqs,
  toCatalogCode,
  type CourseCode,
} from "@jevschedule/shared";
import { useCatalogCourses } from "../hooks/useCatalog.js";
import { useCompletedCourses } from "../hooks/useCompletedCourses.js";
import { CourseSearch } from "./CourseSearch.js";
import { CourseCompletionToggle } from "./CourseCompletionToggle.js";
import { ImportProgressFlow } from "./ImportProgressFlow.js";
import { MarkPrereqsDialog } from "./MarkPrereqsDialog.js";

interface PrereqDialogState {
  target: CourseCode;
  prereqs: CourseCode[];
}

export function CompletedCourses() {
  const { courses, loading: catalogLoading, error: catalogError } = useCatalogCourses();
  const { completed, loading, loaded, pending, error, toggleCourse, isCompleted, refresh } =
    useCompletedCourses();
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<CourseCode | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<PrereqDialogState | null>(null);
  const codes = [...new Set([...completed, ...(selected ? [selected] : [])])].sort();
  const catalogByCode = new Map(courses.map((course) => [course.code, course]));
  const completedCredits = [...completed].reduce(
    (sum, code) => sum + (catalogByCode.get(code)?.credits.min ?? 0),
    0,
  );

  async function handleSearchToggle(code: CourseCode) {
    if (completed.has(code)) {
      await toggleCourse(code);
      return;
    }

    try {
      const details = await window.jevschedule.catalog.getCourseDetails([code]);
      const prereqs = getRequiredUnmetPrereqs(details[code]?.prereq.tree ?? null, completed);
      if (prereqs.length > 0) {
        setDialog({ target: code, prereqs });
        return;
      }
    } catch {
      // Completion remains available while the catalog server is unavailable.
    }

    await toggleCourse(code);
  }

  async function acceptPrereqs(target: CourseCode, prereqs: CourseCode[]) {
    await toggleCourse(target);
    for (const prereq of prereqs) {
      if (!completed.has(prereq)) await toggleCourse(prereq);
    }
    setDialog(null);
  }

  async function declinePrereqs(target: CourseCode) {
    await toggleCourse(target);
    setDialog(null);
  }

  function selectCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = CourseCodeSchema.safeParse(input.trim().toUpperCase());
    if (!parsed.success) {
      setInputError("Enter a course code such as CSC 1350 (2–4 letters, a space, and 4 digits).");
      return;
    }
    const code = toCatalogCode(parsed.data);
    if (!courses.some((course) => course.code === code)) {
      setInputError(`${code} is not in the LSU course catalog.`);
      return;
    }
    setInputError(null);
    setSelected(code);
    setInput(code);
  }

  return (
    <main>
      <header className="page-header">
        <h1>Completed courses</h1>
        <p className="page-subtitle">
          Search the LSU catalog and mark what you have finished. Everything stays on this device.
        </p>
      </header>
      <div className="courses-layout">
        <section className="courses-catalog card" aria-label="Course catalog">
          {catalogLoading ? (
            <p>Loading course catalog…</p>
          ) : catalogError ? (
            <p role="alert">
              Course catalog unavailable: {catalogError.message}. Courses can&apos;t be verified or
              marked completed until the server is reachable.
            </p>
          ) : (
            <CourseSearch
              courses={courses}
              completedCourses={completed}
              onToggleCompleted={(code) => {
                if (loaded) void handleSearchToggle(code);
              }}
            />
          )}
        </section>
        <div className="courses-side">
          <section className="card" aria-labelledby="completed-heading">
            <div className="completed-heading-row">
              <h2 id="completed-heading">Your completed courses</h2>
              {loaded && (
                <span className="badge badge-info" data-testid="completed-summary">
                  {completed.size} {completed.size === 1 ? "course" : "courses"}
                  {completedCredits > 0 && ` · ${completedCredits} cr`}
                </span>
              )}
            </div>
            <p className="muted">
              Enter a course code to mark it complete or incomplete. Changes stay on this device.
            </p>
            <form className="toolbar" onSubmit={selectCourse}>
              <div className="course-entry">
                <label className="field" htmlFor="course-code">
                  <span className="field-label">Course code</span>
                  <input
                    id="course-code"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="CSC 1350"
                    disabled={catalogLoading || catalogError !== null || !loaded}
                    aria-invalid={inputError !== null}
                    aria-describedby={inputError ? "course-code-error" : undefined}
                  />
                </label>
                <button type="submit" disabled={catalogLoading || catalogError !== null || !loaded}>
                  Show course
                </button>
              </div>
              {inputError && (
                <p id="course-code-error" role="alert">
                  {inputError}
                </p>
              )}
            </form>
            {error && (
              <p role="alert">
                {loaded && error.message.includes("Not in the LSU course catalog")
                  ? error.message
                  : loaded
                    ? "Could not save completion. The previous state has been restored. Try the toggle again."
                    : "Could not load completed courses. Restart the app to try again."}
              </p>
            )}
            <p role="status">
              {loading
                ? "Loading saved courses…"
                : pending.size > 0
                  ? "Saving completion…"
                  : error
                    ? ""
                    : "Changes saved on this device."}
            </p>
            {loaded && codes.length === 0 && (
              <p className="empty-state">
                No courses marked complete yet. Search the catalog or import your record below.
              </p>
            )}
            <ul className="completed-courses">
              {codes.map((code) => (
                <li key={code}>
                  <CourseCompletionToggle
                    courseId={code}
                    isCompleted={isCompleted(code)}
                    onToggle={(courseId) => {
                      void toggleCourse(courseId);
                    }}
                    label={`${code} completed`}
                    disabled={!loaded || pending.has(code)}
                  />
                  {catalogByCode.get(code) && (
                    <span className="completed-course-title">{catalogByCode.get(code)?.title}</span>
                  )}
                  {isCompleted(code) &&
                    !catalogLoading &&
                    !catalogError &&
                    !courses.some((course) => course.code === code) && (
                      <span className="badge badge-warning">Not in catalog</span>
                    )}
                </li>
              ))}
            </ul>
          </section>
          <section className="card" aria-label="Import transcript">
            <ImportProgressFlow
              catalogCodes={new Set(courses.map((course) => course.code))}
              onImportComplete={() => void refresh()}
            />
          </section>
        </div>
      </div>
      {dialog && (
        <MarkPrereqsDialog
          isOpen
          targetCourse={dialog.target}
          unfulfilledPrereqs={dialog.prereqs}
          onAccept={(target, prereqs) => void acceptPrereqs(target, prereqs)}
          onDecline={(target) => void declinePrereqs(target)}
          onCancel={() => setDialog(null)}
        />
      )}
    </main>
  );
}
