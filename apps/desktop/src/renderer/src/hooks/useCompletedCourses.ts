import { useState, useEffect, useCallback, useRef } from "react";
import type { CourseCode } from "@jevschedule/shared";

export function useCompletedCourses() {
  const [completed, setCompleted] = useState<Set<CourseCode>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const completedRef = useRef(completed);

  useEffect(() => {
    window.jevschedule.completed
      .get()
      .then((courses) => {
        completedRef.current = new Set(courses);
        setCompleted(completedRef.current);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
  }, []);

  const toggleCourse = useCallback(async (courseId: CourseCode) => {
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
    }
  }, []);

  const isCompleted = useCallback(
    (courseId: CourseCode) => {
      return completed.has(courseId);
    },
    [completed],
  );

  return { completed, loading, error, toggleCourse, isCompleted };
}
