import { useMemo, useState } from "react";
import type { Course } from "@jevschedule/shared";

export interface UseCourseSearchOptions {
  maxResults?: number;
}

function findMatchingCourses(courses: Course[], query: string): Course[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return courses;
  }

  // Remove spaces for code matching (e.g. "csc1350" matches "CSC 1350")
  const queryNoSpaces = normalizedQuery.replace(/\s+/g, "");

  return courses.filter((course) => {
    const codeLower = course.code.toLowerCase();
    const codeNoSpaces = codeLower.replace(/\s+/g, "");
    const titleLower = course.title.toLowerCase();

    return (
      codeLower.includes(normalizedQuery) ||
      codeNoSpaces.includes(queryNoSpaces) ||
      titleLower.includes(normalizedQuery)
    );
  });
}

export function filterCourses(courses: Course[], query: string, maxResults = 50): Course[] {
  return findMatchingCourses(courses, query).slice(0, maxResults);
}

export function useCourseSearch(initialCourses: Course[], options: UseCourseSearchOptions = {}) {
  const [query, setQuery] = useState("");
  const { maxResults = 50 } = options;

  const matches = useMemo(
    () => findMatchingCourses(initialCourses, query),
    [initialCourses, query],
  );
  const results = useMemo(() => matches.slice(0, maxResults), [matches, maxResults]);

  const clearQuery = () => setQuery("");

  return {
    query,
    setQuery,
    clearQuery,
    results,
    totalCount: matches.length,
    hasMatches: results.length > 0,
  };
}
