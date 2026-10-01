import { useMemo, useState } from "react";
import type { Course } from "@jevschedule/shared";

export interface UseCourseSearchOptions {
  maxResults?: number;
}

export function filterCourses(courses: Course[], query: string, maxResults = 50): Course[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return courses.slice(0, maxResults);
  }

  // Remove spaces for code matching (e.g. "csc1350" matches "CSC 1350")
  const queryNoSpaces = normalizedQuery.replace(/\s+/g, "");

  const matches = courses.filter((course) => {
    const codeLower = course.code.toLowerCase();
    const codeNoSpaces = codeLower.replace(/\s+/g, "");
    const titleLower = course.title.toLowerCase();

    return (
      codeLower.includes(normalizedQuery) ||
      codeNoSpaces.includes(queryNoSpaces) ||
      titleLower.includes(normalizedQuery)
    );
  });

  return matches.slice(0, maxResults);
}

export function useCourseSearch(initialCourses: Course[], options: UseCourseSearchOptions = {}) {
  const [query, setQuery] = useState("");
  const { maxResults = 50 } = options;

  const results = useMemo(() => {
    return filterCourses(initialCourses, query, maxResults);
  }, [initialCourses, query, maxResults]);

  const clearQuery = () => setQuery("");

  return {
    query,
    setQuery,
    clearQuery,
    results,
    totalCount: results.length,
    hasMatches: results.length > 0,
  };
}
