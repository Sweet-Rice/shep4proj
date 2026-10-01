import { useState, useEffect, useCallback } from "react";
import type { CourseCode } from "@jevschedule/shared";

export function useCompletedCourses() {
  const [completed, setCompleted] = useState<Set<CourseCode>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    window.jevschedule.completed
      .get()
      .then((courses) => {
        setCompleted(new Set(courses));
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
  }, []);

  const toggleCourse = useCallback(async (courseId: CourseCode) => {
    setCompleted((prev) => {
      const isNowCompleted = !prev.has(courseId);
      const next = new Set(prev);
      if (isNowCompleted) {
        next.add(courseId);
      } else {
        next.delete(courseId);
      }

      window.jevschedule.completed.set(courseId, isNowCompleted).catch((err) => {
        console.error("Failed to toggle course completion:", err);
        // Rollback on failure
        setCompleted((current) => {
          const rollback = new Set(current);
          if (isNowCompleted) {
            rollback.delete(courseId);
          } else {
            rollback.add(courseId);
          }
          return rollback;
        });
      });

      return next;
    });
  }, []);

  const isCompleted = useCallback(
    (courseId: CourseCode) => {
      return completed.has(courseId);
    },
    [completed],
  );

  return { completed, loading, error, toggleCourse, isCompleted };
}
