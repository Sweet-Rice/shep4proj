import { useMemo } from "react";
import type { DegreeEvaluation, EvaluatedRequirement } from "@jevschedule/shared";

export interface BucketCreditTotal {
  id: string;
  label: string;
  kind: EvaluatedRequirement["kind"];
  category?: string;
  requiredCredits: number;
  fulfilledCredits: number;
  remainingCredits: number;
  isSatisfied: boolean;
}

export interface CreditHourTotalsSummary {
  overall: {
    requiredCredits: number;
    fulfilledCredits: number;
    remainingCredits: number;
    percentage: number;
    isSatisfied: boolean;
  };
  buckets: BucketCreditTotal[];
}

export function calculateCreditHourTotals(
  evaluation: DegreeEvaluation | null,
): CreditHourTotalsSummary | null {
  if (!evaluation) return null;

  const buckets: BucketCreditTotal[] = evaluation.requirements.map((req) => {
    let requiredCredits = 0;
    let fulfilledCredits = 0;

    switch (req.kind) {
      case "fixed":
        requiredCredits = req.courses.length * 3;
        fulfilledCredits = req.fulfilledCourses.length * 3;
        break;
      case "chooseN":
        requiredCredits = req.n * 3;
        fulfilledCredits = req.fulfilledOptions.length * 3;
        break;
      case "creditBucket":
        requiredCredits = req.credits;
        fulfilledCredits = req.fulfilledCredits;
        break;
    }

    const remainingCredits = Math.max(0, requiredCredits - fulfilledCredits);

    return {
      id: req.id,
      label: req.label,
      kind: req.kind,
      category: req.kind === "creditBucket" ? req.category : undefined,
      requiredCredits,
      fulfilledCredits,
      remainingCredits,
      isSatisfied: req.isSatisfied,
    };
  });

  const overallRequired = evaluation.totalCreditsRequired;
  const overallFulfilled = evaluation.totalCreditsFulfilled;
  const overallRemaining = Math.max(0, overallRequired - overallFulfilled);
  const percentage = Math.round(
    overallRequired > 0 ? (overallFulfilled / overallRequired) * 100 : 0,
  );

  return {
    overall: {
      requiredCredits: overallRequired,
      fulfilledCredits: overallFulfilled,
      remainingCredits: overallRemaining,
      percentage,
      isSatisfied: evaluation.isSatisfied,
    },
    buckets,
  };
}

export function useCreditHourTotals(
  evaluation: DegreeEvaluation | null,
): CreditHourTotalsSummary | null {
  return useMemo(() => calculateCreditHourTotals(evaluation), [evaluation]);
}
