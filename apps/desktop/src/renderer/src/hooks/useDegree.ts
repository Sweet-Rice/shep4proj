import { useEffect, useState } from "react";
import type { DegreeProgram } from "@jevschedule/shared";

export interface UseDegreeResult {
  degree: DegreeProgram | null;
  loading: boolean;
  error: Error | null;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function useDegree(): UseDegreeResult {
  const [degree, setDegree] = useState<DegreeProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadDegree = async () => {
      try {
        const degrees = await window.jevschedule.catalog.listDegrees();
        if (degrees.length === 0) {
          throw new Error("No degree programs are available from the server");
        }
        const result = await window.jevschedule.catalog.getDegree(degrees[0]!.id);
        if (cancelled) return;
        setDegree(result);
        setLoading(false);
      } catch (reason) {
        if (cancelled) return;
        setError(asError(reason));
        setLoading(false);
      }
    };
    void loadDegree();
    return () => {
      cancelled = true;
    };
  }, []);

  return { degree, loading, error };
}
