import { useState, type ReactNode } from "react";
import type { CourseCode, CourseDetail, EligibilityResult } from "@jevschedule/shared";
import { useCatalogCourses, useCourseDetails } from "../hooks/useCatalog.js";
import { useCompletedCourses } from "../hooks/useCompletedCourses.js";
import { plannerTools } from "../services/plannerTools.js";
import { matchesCourseQuery } from "./courseFilter.js";
import { formatCreditsDisplay } from "./CourseSearch.js";

const PAGE_SIZE = 25;

const SERVER_ALERT =
  "Couldn't reach the JevSchedule server. It may be waking up, which can take up to a minute. Try again.";

interface ListedCourse {
  detail: CourseDetail;
  result: EligibilityResult;
}

export function EligibleCoursesScreen() {
  const { courses, loading: catalogLoading, error: catalogError } = useCatalogCourses();
  const { completed, loaded, error: completedError } = useCompletedCourses();

  let body;
  if (catalogError) {
    body = <p role="alert">{SERVER_ALERT}</p>;
  } else if (completedError) {
    body = <p role="alert">Could not load or update completed courses. Please try again.</p>;
  } else if (catalogLoading || !loaded) {
    body = <p role="status">Checking eligibility…</p>;
  } else {
    body = (
      <EligibilitySections
        codes={courses.map(({ code }) => code).filter((code) => !completed.has(code))}
        completed={completed}
      />
    );
  }

  return (
    <main className="eligible-courses-screen">
      <header className="page-header">
        <h1>Eligible courses</h1>
        <p className="page-subtitle">
          Courses you can take next, based on the prerequisites you have completed.
        </p>
      </header>
      {body}
    </main>
  );
}

/** Mounted once the catalog and completions are known, so the details request starts loading. */
function EligibilitySections({
  codes,
  completed,
}: {
  codes: CourseCode[];
  completed: Set<CourseCode>;
}) {
  const { details, loading, error } = useCourseDetails(codes);
  const [expanded, setExpanded] = useState<Set<CourseCode>>(new Set());
  const [query, setQuery] = useState("");
  const [undergradOnly, setUndergradOnly] = useState(true);

  if (error) return <p role="alert">{SERVER_ALERT}</p>;
  if (loading)
    return (
      <div className="eligible-loading">
        <p role="status">Checking eligibility…</p>
        <p className="eligible-loading-hint">
          Checking prerequisites for every course in the catalog. This can take up to a minute.
        </p>
      </div>
    );

  const groups: Record<EligibilityResult["status"], ListedCourse[]> = {
    eligible: [],
    needs_review: [],
    ineligible: [],
  };
  for (const { course, result } of plannerTools.getEligible(Object.values(details), completed)) {
    const detail = details[course.code];
    if (detail && matchesCourseQuery(detail, query) && (!undergradOnly || isUndergrad(detail.code)))
      groups[result.status].push({ detail, result });
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => a.detail.code.localeCompare(b.detail.code));
  }

  const toggle = (code: CourseCode) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "start" });

  return (
    <>
      <div className="eligible-search">
        <input
          type="search"
          aria-label="Search eligible courses"
          placeholder="Filter by code, department or title, e.g. CSC or calculus"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <label className="eligible-undergrad-toggle">
          <input
            type="checkbox"
            checked={undergradOnly}
            onChange={(event) => setUndergradOnly(event.currentTarget.checked)}
          />
          Undergraduate only
        </label>
      </div>
      <div className="eligible-summary" aria-label="Eligibility summary">
        <SummaryTile
          tone="success"
          label="Eligible now"
          count={groups.eligible.length}
          onClick={() => jumpTo("eligible-now-heading")}
        />
        <SummaryTile
          tone="warning"
          label="Needs review"
          count={groups.needs_review.length}
          onClick={() => jumpTo("needs-review-heading")}
        />
        <SummaryTile
          tone="danger"
          label="Blocked"
          count={groups.ineligible.length}
          onClick={() => jumpTo("blocked-heading")}
        />
      </div>

      <section aria-labelledby="eligible-now-heading">
        <h2 id="eligible-now-heading">Eligible now ({groups.eligible.length})</h2>
        <LimitedList items={groups.eligible} getKey={({ detail }) => detail.code}>
          {({ detail }) => <CourseSummary detail={detail} />}
        </LimitedList>
      </section>

      <section aria-labelledby="needs-review-heading">
        <h2 id="needs-review-heading">Needs review ({groups.needs_review.length})</h2>
        <LimitedList items={groups.needs_review} getKey={({ detail }) => detail.code}>
          {({ detail, result }) => (
            <>
              <CourseSummary detail={detail} />
              <p role="note">{result.warning}</p>
              {detail.prereq.reviewReason && <p>{detail.prereq.reviewReason}</p>}
            </>
          )}
        </LimitedList>
      </section>

      <section aria-labelledby="blocked-heading">
        <h2 id="blocked-heading">Blocked ({groups.ineligible.length})</h2>
        <LimitedList items={groups.ineligible} getKey={({ detail }) => detail.code}>
          {({ detail, result }) => {
            const slug = detail.code.replace(" ", "-");
            const open = expanded.has(detail.code);
            return (
              <>
                <CourseSummary detail={detail} />
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  aria-expanded={open}
                  aria-controls={`why-${slug}`}
                  onClick={() => toggle(detail.code)}
                >
                  Why blocked?
                </button>
                <ul
                  id={`why-${slug}`}
                  aria-label={`Missing prerequisites for ${detail.code}`}
                  hidden={!open}
                >
                  {result.missingPrerequisites.map((missing, index) => (
                    <li key={`${index}-${missing}`}>{missing}</li>
                  ))}
                </ul>
              </>
            );
          }}
        </LimitedList>
      </section>
    </>
  );
}

/** LSU numbers graduate courses 5000 and up. */
function isUndergrad(code: CourseCode): boolean {
  const number = Number(/\d{4}/.exec(code)?.[0]);
  return !Number.isFinite(number) || number < 5000;
}

function SummaryTile({
  tone,
  label,
  count,
  onClick,
}: {
  tone: "success" | "warning" | "danger";
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`eligible-tile eligible-tile-${tone}`} onClick={onClick}>
      <span className="eligible-tile-count">{count}</span>
      <span className="eligible-tile-label">{label}</span>
    </button>
  );
}

/** Renders the first page of a long list; the catalog can make "Eligible now" thousands long. */
function LimitedList<T>({
  items,
  getKey,
  children,
}: {
  items: T[];
  getKey: (item: T) => string;
  children: (item: T) => ReactNode;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const shown = items.slice(0, limit);
  return (
    <>
      <ul className="eligible-list">
        {shown.map((item) => (
          <li key={getKey(item)} className="eligible-row">
            {children(item)}
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <button
          type="button"
          className="btn btn-secondary btn-sm eligible-more"
          onClick={() => setLimit((prev) => prev + PAGE_SIZE * 2)}
        >
          Show more ({items.length - shown.length} remaining)
        </button>
      )}
    </>
  );
}

function CourseSummary({ detail }: { detail: CourseDetail }) {
  return (
    <span className="eligible-course">
      <strong className="eligible-course-code">{detail.code}</strong>{" "}
      <span className="eligible-course-title">{detail.title}</span>{" "}
      <span className="course-credits">{formatCreditsDisplay(detail.credits)}</span>
    </span>
  );
}
