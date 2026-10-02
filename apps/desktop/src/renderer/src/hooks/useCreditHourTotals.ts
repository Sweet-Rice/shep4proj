import { useMemo } from "react";
import type { DegreeEvaluation } from "@jevschedule/shared";

export interface CreditHourTotalsSummary {
  overall: {
    requiredCredits: number;
    fulfilledCredits: number;
    remainingCredits: number;
    percentage: number;
    isSatisfied: boolean;
  };
}

export function calculateCreditHourTotals(
  evaluation: DegreeEvaluation | null,
): CreditHourTotalsSummary | null {
  if (!evaluation) return null;
  const requiredCredits = evaluation.totalCreditsRequired;
  const fulfilledCredits = evaluation.totalCreditsFulfilled;
  return {
    overall: {
      requiredCredits,
      fulfilledCredits,
      remainingCredits: Math.max(0, requiredCredits - fulfilledCredits),
      percentage: Math.round(requiredCredits > 0 ? (fulfilledCredits / requiredCredits) * 100 : 0),
      isSatisfied: evaluation.isSatisfied,
    },
  };
}

export function useCreditHourTotals(
  evaluation: DegreeEvaluation | null,
): CreditHourTotalsSummary | null {
  return useMemo(() => calculateCreditHourTotals(evaluation), [evaluation]);
}
