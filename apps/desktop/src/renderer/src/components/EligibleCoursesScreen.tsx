import { useState } from "react";
import type { CourseCode, CourseDetail, EligibilityResult } from "@jevschedule/shared";
import { useCatalogCourses, useCourseDetails } from "../hooks/useCatalog.js";
import { useCompletedCourses } from "../hooks/useCompletedCourses.js";
import { plannerTools } from "../services/plannerTools.js";
import { formatCreditsDisplay } from "./CourseSearch.js";

const SERVER_ALERT =
  "Could not reach the JevSchedule server. Start it with pnpm dev and reopen this tab.";

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
      <h1>Eligible courses</h1>
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

  if (error) return <p role="alert">{SERVER_ALERT}</p>;
  if (loading) return <p role="status">Checking eligibility…</p>;

  const groups: Record<EligibilityResult["status"], ListedCourse[]> = {
    eligible: [],
    needs_review: [],
    ineligible: [],
  };
  for (const { course, result } of plannerTools.getEligible(Object.values(details), completed)) {
    const detail = details[course.code];
    if (detail) groups[result.status].push({ detail, result });
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

  return (
    <>
      <section aria-labelledby="eligible-now-heading">
        <h2 id="eligible-now-heading">Eligible now ({groups.eligible.length})</h2>
        <ul>
          {groups.eligible.map(({ detail }) => (
            <li key={detail.code}>
              <CourseSummary detail={detail} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="needs-review-heading">
        <h2 id="needs-review-heading">Needs review ({groups.needs_review.length})</h2>
        <ul>
          {groups.needs_review.map(({ detail, result }) => (
            <li key={detail.code}>
              <CourseSummary detail={detail} />
              <p role="note">{result.warning}</p>
              {detail.prereq.reviewReason && <p>{detail.prereq.reviewReason}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="blocked-heading">
        <h2 id="blocked-heading">Blocked ({groups.ineligible.length})</h2>
        <ul>
          {groups.ineligible.map(({ detail, result }) => {
            const slug = detail.code.replace(" ", "-");
            const open = expanded.has(detail.code);
            return (
              <li key={detail.code}>
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
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function CourseSummary({ detail }: { detail: CourseDetail }) {
  return (
    <span className="eligible-course">
      <strong className="eligible-course-code">{detail.code}</strong> {detail.title}{" "}
      <span className="course-credits">{formatCreditsDisplay(detail.credits)}</span>
    </span>
  );
}
