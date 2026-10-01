import type { Course, CourseCode } from "@jevschedule/shared";
import { SAMPLE_CATALOG, useCourseSearch } from "../hooks/useCourseSearch.js";

export interface CourseSearchProps {
  courses?: Course[];
  completedCourses?: Set<CourseCode>;
  onSelectCourse?: (course: Course) => void;
  onToggleCompleted?: (code: CourseCode) => void;
  placeholder?: string;
}

export function CourseSearch({
  courses = SAMPLE_CATALOG,
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
                  <span className="course-credits">{course.credits} cr</span>
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
