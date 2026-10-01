import { useMemo, useState } from "react";
import type { Course, CourseCode } from "@jevschedule/shared";

export const SAMPLE_CATALOG: Course[] = [
  {
    code: "CSC 1350",
    title: "Computer Science I for Majors",
    credits: 3,
    description: "Fundamentals of algorithm development and object-oriented programming in Java.",
    department: "Computer Science",
  },
  {
    code: "CSC 1351",
    title: "Computer Science II for Majors",
    credits: 3,
    description: "Data structures, recursion, stacks, queues, trees, and object-oriented design.",
    department: "Computer Science",
  },
  {
    code: "CSC 2250",
    title: "Discrete Structures",
    credits: 3,
    description: "Sets, logic, relations, functions, graph theory, and proof techniques.",
    department: "Computer Science",
  },
  {
    code: "CSC 3102",
    title: "Advanced Data Structures and Algorithm Analysis",
    credits: 3,
    description: "Asymptotic analysis, balanced trees, heaps, hash tables, and graph algorithms.",
    department: "Computer Science",
  },
  {
    code: "MATH 1550",
    title: "Differential and Integral Calculus",
    credits: 5,
    description: "Limits, derivatives, applications of derivatives, and definite integrals.",
    department: "Mathematics",
  },
  {
    code: "MATH 1552",
    title: "Analytic Geometry and Calculus II",
    credits: 4,
    description: "Integration techniques, sequences, infinite series, and power series.",
    department: "Mathematics",
  },
  {
    code: "ENGL 1001",
    title: "English Composition",
    credits: 3,
    description: "Introduction to academic writing, critical reading, and revision strategies.",
    department: "English",
  },
  {
    code: "ENGL 2000",
    title: "English Composition II",
    credits: 3,
    description: "Practice in argument, research methods, and writing for academic disciplines.",
    department: "English",
  },
  {
    code: "BIOL 1001",
    title: "General Biology I",
    credits: 3,
    description: "Principles of biology, cellular structure, metabolism, and genetics.",
    department: "Biological Sciences",
  },
  {
    code: "CHEM 1201",
    title: "Basic Chemistry I",
    credits: 3,
    description: "Atomic structure, chemical bonding, stoichiometry, and thermochemistry.",
    department: "Chemistry",
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
    const deptLower = course.department ? course.department.toLowerCase() : "";

    return (
      codeLower.includes(normalizedQuery) ||
      codeNoSpaces.includes(queryNoSpaces) ||
      titleLower.includes(normalizedQuery) ||
      deptLower.includes(normalizedQuery)
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
