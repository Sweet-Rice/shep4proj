import { useEffect, useMemo, useState } from "react";
import type { Course, CourseCode, CourseDetail, CourseOfferingHistory } from "@jevschedule/shared";

/** Matches the cap the main process enforces on one course-details request. */
const COURSE_DETAILS_CHUNK_SIZE = 500;

async function fetchCourseDetailsInChunks(
  codes: readonly CourseCode[],
): Promise<Record<CourseCode, CourseDetail>> {
  // Sequential on purpose: the main process already fans each chunk out over several HTTP workers.
  const merged: Record<CourseCode, CourseDetail> = {};
  for (let i = 0; i < codes.length; i += COURSE_DETAILS_CHUNK_SIZE) {
    const chunk = codes.slice(i, i + COURSE_DETAILS_CHUNK_SIZE);
    Object.assign(merged, await window.jevschedule.catalog.getCourseDetails(chunk));
  }
  return merged;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function useCatalogCourses(): { courses: Course[]; loading: boolean; error: Error | null } {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.jevschedule.catalog.listCourses().then(
      (result) => {
        if (cancelled) return;
        setCourses(result);
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
  }, []);

  return { courses, loading, error };
}

export function useCourseDetails(codes: readonly CourseCode[]): {
  details: Record<CourseCode, CourseDetail>;
  loading: boolean;
  error: Error | null;
} {
  const codesKey = useMemo(() => [...new Set(codes)].sort().join("|"), [codes]);
  const normalizedCodes = useMemo(
    () => (codesKey ? (codesKey.split("|") as CourseCode[]) : []),
    [codesKey],
  );
  const [details, setDetails] = useState<Record<CourseCode, CourseDetail>>({});
  const [loading, setLoading] = useState(normalizedCodes.length > 0);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetails({});
    setError(null);
    if (normalizedCodes.length === 0) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    fetchCourseDetailsInChunks(normalizedCodes).then(
      (result) => {
        if (cancelled) return;
        setDetails(result);
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
  }, [codesKey, normalizedCodes]);

  return { details, loading, error };
}

export function useCourseHistory(codes: readonly CourseCode[]): {
  history: Record<CourseCode, CourseOfferingHistory[]>;
  loading: boolean;
  error: Error | null;
} {
  const codesKey = useMemo(() => [...new Set(codes)].sort().join("|"), [codes]);
  const normalizedCodes = useMemo(
    () => (codesKey ? (codesKey.split("|") as CourseCode[]) : []),
    [codesKey],
  );
  const [history, setHistory] = useState<Record<CourseCode, CourseOfferingHistory[]>>({});
  const [loading, setLoading] = useState(normalizedCodes.length > 0);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistory({});
    setError(null);
    if (normalizedCodes.length === 0) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    Promise.all(
      normalizedCodes.map(async (code) => {
        const courseHistory = await window.jevschedule.catalog.getCourseHistory(code);
        return [code, courseHistory] as const;
      }),
    ).then(
      (entries) => {
        if (cancelled) return;
        setHistory(Object.fromEntries(entries) as Record<CourseCode, CourseOfferingHistory[]>);
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
  }, [codesKey, normalizedCodes]);

  return { history, loading, error };
}
