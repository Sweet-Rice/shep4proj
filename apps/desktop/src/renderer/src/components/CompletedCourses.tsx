import { useState, type FormEvent } from "react";
import { CourseCodeSchema, type CourseCode } from "@jevschedule/shared";
import { useCompletedCourses } from "../hooks/useCompletedCourses.js";
import { CourseCompletionToggle } from "./CourseCompletionToggle.js";

export function CompletedCourses() {
  const { completed, loading, loaded, pending, error, toggleCourse, isCompleted } =
    useCompletedCourses();
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<CourseCode | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const codes = [...new Set([...completed, ...(selected ? [selected] : [])])].sort();

  function selectCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = CourseCodeSchema.safeParse(input.trim().toUpperCase());
    if (!parsed.success) {
      setInputError("Enter a course code such as CSC 1350 (2–4 letters, a space, and 4 digits).");
      return;
    }
    setInputError(null);
    setSelected(parsed.data);
    setInput(parsed.data);
  }

  return (
    <main>
      <h1>Completed courses</h1>
      <p>Enter a course code to mark it complete or incomplete. Changes stay on this device.</p>
      <form onSubmit={selectCourse}>
        <label htmlFor="course-code">Course code</label>
        <div className="course-entry">
          <input
            id="course-code"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="CSC 1350"
            disabled={!loaded}
            aria-invalid={inputError !== null}
            aria-describedby={inputError ? "course-code-error" : undefined}
          />
          <button type="submit" disabled={!loaded}>
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
          {loaded
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
      {loaded && codes.length === 0 && <p>No courses marked complete yet.</p>}
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
          </li>
        ))}
      </ul>
    </main>
  );
}
