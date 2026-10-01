import { useState, useEffect, useCallback, useRef } from "react";
import type { CourseCode } from "@jevschedule/shared";

export function useCompletedCourses() {
  const [completed, setCompleted] = useState<Set<CourseCode>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const completedRef = useRef(completed);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const pendingRef = useRef(new Set<CourseCode>());
  const [pending, setPending] = useState<Set<CourseCode>>(new Set());

  useEffect(() => {
    let cancelled = false;
    window.jevschedule.completed
      .get()
      .then((courses) => {
        if (cancelled) return;
        completedRef.current = new Set(courses);
        setCompleted(completedRef.current);
        loadedRef.current = true;
        setLoaded(true);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => {
      cancelled = true;
      loadedRef.current = false;
    };
  }, []);

  const toggleCourse = useCallback(async (courseId: CourseCode) => {
    // A failed write can only roll back its own course, with no newer write to undo.
    if (!loadedRef.current || pendingRef.current.has(courseId)) return;
    pendingRef.current.add(courseId);
    setPending(new Set(pendingRef.current));
    setError(null);
    const isNowCompleted = !completedRef.current.has(courseId);
    const next = new Set(completedRef.current);
    if (isNowCompleted) next.add(courseId);
    else next.delete(courseId);
    completedRef.current = next;
    setCompleted(next);

    try {
      await window.jevschedule.completed.set(courseId, isNowCompleted);
    } catch (err) {
      const rollback = new Set(completedRef.current);
      if (isNowCompleted) rollback.delete(courseId);
      else rollback.add(courseId);
      completedRef.current = rollback;
      setCompleted(rollback);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      pendingRef.current.delete(courseId);
      setPending(new Set(pendingRef.current));
    }
  }, []);

  const isCompleted = useCallback(
    (courseId: CourseCode) => {
      return completed.has(courseId);
    },
    [completed],
  );

  return { completed, loading, loaded, pending, error, toggleCourse, isCompleted };
}
