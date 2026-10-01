import { useMemo, useState } from "react";
import type { Course } from "@jevschedule/shared";

export const SAMPLE_CATALOG: Course[] = [
  {
    catalogYear: "2026-2027",
    code: "CSC 1350",
    title: "Computer Science I for Majors",
    credits: { min: 3, max: 3, note: null },
    description: "Fundamentals of algorithm development and object-oriented programming in Java.",
    prerequisiteText: "MATH 1021 or placement",
  },
  {
    catalogYear: "2026-2027",
    code: "CSC 1351",
    title: "Computer Science II for Majors",
    credits: { min: 3, max: 3, note: null },
    description: "Data structures, recursion, stacks, queues, trees, and object-oriented design.",
    prerequisiteText: "CSC 1350 with C or better",
  },
  {
    catalogYear: "2026-2027",
    code: "CSC 2250",
    title: "Discrete Structures",
    credits: { min: 3, max: 3, note: null },
    description: "Sets, logic, relations, functions, graph theory, and proof techniques.",
    prerequisiteText: "CSC 1350 and MATH 1550",
  },
  {
    catalogYear: "2026-2027",
    code: "CSC 3102",
    title: "Advanced Data Structures and Algorithm Analysis",
    credits: { min: 3, max: 3, note: null },
    description: "Asymptotic analysis, balanced trees, heaps, hash tables, and graph algorithms.",
    prerequisiteText: "CSC 1351 and CSC 2250",
  },
  {
    catalogYear: "2026-2027",
    code: "MATH 1550",
    title: "Differential and Integral Calculus",
    credits: { min: 5, max: 5, note: null },
    description: "Limits, derivatives, applications of derivatives, and definite integrals.",
    prerequisiteText: null,
  },
  {
    catalogYear: "2026-2027",
    code: "MATH 1552",
    title: "Analytic Geometry and Calculus II",
    credits: { min: 4, max: 4, note: null },
    description: "Integration techniques, sequences, infinite series, and power series.",
    prerequisiteText: "MATH 1550",
  },
  {
    catalogYear: "2026-2027",
    code: "ENGL 1001",
    title: "English Composition",
    credits: { min: 3, max: 3, note: null },
    description: "Introduction to academic writing, critical reading, and revision strategies.",
    prerequisiteText: null,
  },
  {
    catalogYear: "2026-2027",
    code: "ENGL 2000",
    title: "English Composition II",
    credits: { min: 3, max: 3, note: null },
    description: "Practice in argument, research methods, and writing for academic disciplines.",
    prerequisiteText: "ENGL 1001",
  },
  {
    catalogYear: "2026-2027",
    code: "BIOL 1001",
    title: "General Biology I",
    credits: { min: 3, max: 3, note: null },
    description: "Principles of biology, cellular structure, metabolism, and genetics.",
    prerequisiteText: null,
  },
  {
    catalogYear: "2026-2027",
    code: "CHEM 1201",
    title: "Basic Chemistry I",
    credits: { min: 3, max: 3, note: null },
    description: "Atomic structure, chemical bonding, stoichiometry, and thermochemistry.",
    prerequisiteText: null,
  },
];

export interface UseCourseSearchOptions {
  courses?: Course[];
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

export function useCourseSearch(
  initialCourses: Course[] = SAMPLE_CATALOG,
  options: UseCourseSearchOptions = {},
) {
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
