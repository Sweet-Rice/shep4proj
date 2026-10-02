import type { DegreeEvaluation } from "@jevschedule/shared";
import { useCreditHourTotals } from "../hooks/useCreditHourTotals.js";

export interface CreditHourTotalsViewProps {
  evaluation: DegreeEvaluation | null;
}

export function CreditHourTotalsView({ evaluation }: CreditHourTotalsViewProps) {
  const totals = useCreditHourTotals(evaluation);
  if (!totals) return null;

  return (
    <div className="credit-hour-totals-container" data-testid="credit-hour-totals">
      <h3>Credit-Hour Summary</h3>
      <div className="overall-totals-card" data-testid="overall-totals-card">
        <div className="totals-header">
          <h4>Overall Degree Progress</h4>
          <span
            className={`totals-badge ${totals.overall.isSatisfied ? "satisfied" : "in-progress"}`}
          >
            {totals.overall.isSatisfied ? "Fulfilled" : "In Progress"}
          </span>
        </div>
        <div className="totals-metrics">
          <div className="metric">
            <span className="metric-label">Fulfilled</span>
            <span className="metric-value" data-testid="overall-fulfilled">
              {totals.overall.fulfilledCredits} hrs
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Remaining</span>
            <span className="metric-value" data-testid="overall-remaining">
              {totals.overall.remainingCredits} hrs
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Required Total</span>
            <span className="metric-value" data-testid="overall-required">
              {totals.overall.requiredCredits} hrs
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
