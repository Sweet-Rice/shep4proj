import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_CREDIT_LIMIT,
  type CourseCode,
  type Plan,
  type PlanTerm,
  type Season,
} from "@jevschedule/shared";

const DEFAULT_PLAN: Plan = {
  creditLimit: DEFAULT_CREDIT_LIMIT,
  terms: [
    { season: "Fall", year: 2026, courses: ["CSC 1350", "MATH 1550", "ENGL 1001"] },
    { season: "Spring", year: 2027, courses: ["CSC 1351", "MATH 1552"] },
  ],
};

interface JevScheduleGlobal {
  window: {
    jevschedule?: {
      plan: {
        get(): Promise<Plan>;
        save(plan: Plan): Promise<void>;
      };
    };
  };
}

function getPlanApi() {
  const globalWin = globalThis as unknown as JevScheduleGlobal;
  return globalWin.window?.jevschedule?.plan ?? null;
}

export function usePlan(initialPlan: Plan = DEFAULT_PLAN) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Load plan from IPC store on mount
  useEffect(() => {
    let cancelled = false;
    const api = getPlanApi();

    if (!api) {
      setLoaded(true);
      return;
    }

    api
      .get()
      .then((savedPlan) => {
        if (!cancelled) {
          if (savedPlan && savedPlan.terms.length > 0) {
            setPlan(savedPlan);
          }
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Save updated plan to store
  const savePlan = useCallback(
    async (nextPlan: Plan) => {
      const prevPlan = plan;
      setPlan(nextPlan);
      setError(null);

      const api = getPlanApi();
      if (api) {
        try {
          await api.save(nextPlan);
        } catch (err) {
          setPlan(prevPlan);
          setError(err instanceof Error ? err : new Error(String(err)));
          throw err;
        }
      }
    },
    [plan],
  );

  // Move a course from one term/position to another term/position
  const moveCourse = useCallback(
    async (
      sourceTermIndex: number,
      sourceCourseIndex: number,
      destTermIndex: number,
      destCourseIndex: number,
    ) => {
      if (
        sourceTermIndex < 0 ||
        sourceTermIndex >= plan.terms.length ||
        destTermIndex < 0 ||
        destTermIndex >= plan.terms.length
      ) {
        return;
      }

      const nextTerms: PlanTerm[] = plan.terms.map((term) => ({
        ...term,
        courses: [...term.courses],
      }));

      const sourceTerm = nextTerms[sourceTermIndex];
      const destTerm = nextTerms[destTermIndex];

      if (!sourceTerm || !destTerm) return;
      if (sourceCourseIndex < 0 || sourceCourseIndex >= sourceTerm.courses.length) return;

      const [courseCode] = sourceTerm.courses.splice(sourceCourseIndex, 1);
      if (!courseCode) return;

      const targetPos = Math.max(0, Math.min(destCourseIndex, destTerm.courses.length));
      destTerm.courses.splice(targetPos, 0, courseCode);

      await savePlan({
        ...plan,
        terms: nextTerms,
      });
    },
    [plan, savePlan],
  );

  const addCourseToTerm = useCallback(
    async (termIndex: number, code: CourseCode) => {
      if (termIndex < 0 || termIndex >= plan.terms.length) return;

      const nextTerms = plan.terms.map((t, idx) => {
        if (idx !== termIndex) return t;
        if (t.courses.includes(code)) return t;
        return { ...t, courses: [...t.courses, code] };
      });

      await savePlan({ ...plan, terms: nextTerms });
    },
    [plan, savePlan],
  );

  const removeCourseFromTerm = useCallback(
    async (termIndex: number, code: CourseCode) => {
      if (termIndex < 0 || termIndex >= plan.terms.length) return;

      const nextTerms = plan.terms.map((t, idx) => {
        if (idx !== termIndex) return t;
        return { ...t, courses: t.courses.filter((c) => c !== code) };
      });

      await savePlan({ ...plan, terms: nextTerms });
    },
    [plan, savePlan],
  );

  const addTerm = useCallback(
    async (season: Season, year: number) => {
      const nextTerms: PlanTerm[] = [...plan.terms, { season, year, courses: [] }];
      await savePlan({ ...plan, terms: nextTerms });
    },
    [plan, savePlan],
  );

  const removeTerm = useCallback(
    async (termIndex: number) => {
      if (termIndex < 0 || termIndex >= plan.terms.length) return;
      const nextTerms = plan.terms.filter((_, idx) => idx !== termIndex);
      await savePlan({ ...plan, terms: nextTerms });
    },
    [plan, savePlan],
  );

  return {
    plan,
    loaded,
    error,
    moveCourse,
    addCourseToTerm,
    removeCourseFromTerm,
    addTerm,
    removeTerm,
    savePlan,
  };
}
