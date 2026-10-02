import { useState } from "react";
import {
  typicalTerms,
  type Course,
  type CourseCode,
  type CourseOfferingHistory,
} from "@jevschedule/shared";
import { useCourseSearch } from "../hooks/useCourseSearch.js";

export interface CourseSearchProps {
  courses: Course[];
  completedCourses?: Set<CourseCode>;
  onSelectCourse?: (course: Course) => void;
  onToggleCompleted?: (code: CourseCode) => void;
  placeholder?: string;
}

export function formatCreditsDisplay(credits: Course["credits"]): string {
  if (credits.min === credits.max) {
    return `${credits.min} cr`;
  }
  return `${credits.min}-${credits.max} cr`;
}

export function CourseSearch({
  courses,
  completedCourses = new Set(),
  onSelectCourse,
  onToggleCompleted,
  placeholder = "Search by course code or title (e.g. CSC 1350)...",
}: CourseSearchProps) {
  const { query, setQuery, clearQuery, results, totalCount, hasMatches } = useCourseSearch(courses);

  return (
    <div className="course-search-container" data-testid="course-search-container">
      <div className="search-input-wrapper">
        <label htmlFor="course-search-input" className="search-label">
          Search Courses
        </label>
        <div className="input-group">
          <input
            id="course-search-input"
            type="search"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-describedby="course-search-status"
          />
          {query && (
            <button
              type="button"
              className="btn btn-clear"
              onClick={clearQuery}
              aria-label="Clear search query"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div
        id="course-search-status"
        role="status"
        aria-live="polite"
        className="search-status-text"
      >
        {query.trim() ? (
          <span>
            Found {totalCount} course{totalCount === 1 ? "" : "s"} matching &quot;{query}&quot;
            {totalCount > results.length && ` (showing first ${results.length})`}
          </span>
        ) : totalCount > results.length ? (
          <span>
            Showing {results.length} of {totalCount} courses. Search to find the rest.
          </span>
        ) : (
          <span>Showing all {totalCount} courses</span>
        )}
      </div>

      {!hasMatches ? (
        <p className="no-results-message" data-testid="no-results-message">
          No courses found matching &quot;{query}&quot;
        </p>
      ) : (
        <ul className="course-results-list" data-testid="course-results-list">
          {results.map((course) => {
            const isCompleted = completedCourses.has(course.code);

            return (
              <li
                key={course.code}
                className={`course-result-item ${isCompleted ? "completed" : ""}`}
                data-testid={`course-item-${course.code}`}
              >
                <div className="course-item-header">
                  <span className="course-code">{course.code}</span>
                  <span className="course-title">{course.title}</span>
                  <span className="course-credits">{formatCreditsDisplay(course.credits)}</span>
                </div>

                {course.description && <p className="course-description">{course.description}</p>}

                <div className="course-item-actions">
                  {onSelectCourse && (
                    <button
                      type="button"
                      className="btn btn-select"
                      onClick={() => onSelectCourse(course)}
                    >
                      Select
                    </button>
                  )}

                  {onToggleCompleted && (
                    <button
                      type="button"
                      className={`btn btn-toggle ${isCompleted ? "completed" : ""}`}
                      onClick={() => onToggleCompleted(course.code)}
                      aria-pressed={isCompleted}
                    >
                      {isCompleted ? "Completed" : "Mark Completed"}
                    </button>
                  )}
                  <CourseOfferingDisclosure code={course.code} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CourseOfferingDisclosure({ code }: { code: CourseCode }) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<CourseOfferingHistory[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const toggle = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded && history === null && !loading) {
      setLoading(true);
      setError(false);
      window.jevschedule.catalog.getCourseHistory(code).then(
        (result) => {
          setHistory(result);
          setLoading(false);
        },
        () => {
          setError(true);
          setLoading(false);
        },
      );
    }
  };
  const terms = history ? typicalTerms(history) : [];

  return (
    <div className="course-history-disclosure">
      <button type="button" className="btn" aria-expanded={expanded} onClick={toggle}>
        When is this offered?
      </button>
      {expanded && (
        <div>
          {loading ? (
            <p>Loading offering history…</p>
          ) : error ? (
            <p role="alert">
              Course catalog unavailable. Start the server (pnpm dev) to search courses; you can
              still enter codes below.
            </p>
          ) : terms.length > 0 ? (
            <p>
              Offered in:{" "}
              {terms
                .map(
                  ({ season, termCount, years }) =>
                    `${season} (${termCount} ${termCount === 1 ? "term" : "terms"}: ${years.join(", ")})`,
                )
                .join("; ")}
            </p>
          ) : (
            <p>
              No offering history recorded yet. History builds up as each semester&apos;s sections
              are scraped.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
