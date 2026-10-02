import { useEffect, useMemo, useState } from "react";
import type { AcademicPeriodId, CourseCode, Section } from "@jevschedule/shared";

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function useSections(
  courseCodes: CourseCode[],
  term: AcademicPeriodId | null,
): { sectionsByCourse: Record<CourseCode, Section[]>; loading: boolean; error: Error | null } {
  const codesKey = useMemo(() => [...new Set(courseCodes)].sort().join("|"), [courseCodes]);
  const normalizedCodes = useMemo(
    () => (codesKey ? (codesKey.split("|") as CourseCode[]) : []),
    [codesKey],
  );
  const [sectionsByCourse, setSectionsByCourse] = useState<Record<CourseCode, Section[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSectionsByCourse({});
    setError(null);
    if (term === null || normalizedCodes.length === 0) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    Promise.all(
      normalizedCodes.map(
        async (code) => [code, await window.jevschedule.catalog.listSections(code, term)] as const,
      ),
    ).then(
      (entries) => {
        if (cancelled) return;
        setSectionsByCourse(Object.fromEntries(entries) as Record<CourseCode, Section[]>);
        setLoading(false);
      },
      (reason: unknown) => {
        if (cancelled) return;
        setError(asError(reason));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [codesKey, normalizedCodes, term]);

  return { sectionsByCourse, loading, error };
}
