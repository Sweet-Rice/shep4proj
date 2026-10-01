import type { DegreeEvaluation } from "@jevschedule/shared";
import { useCreditHourTotals } from "../hooks/useCreditHourTotals.js";

export interface CreditHourTotalsViewProps {
  evaluation: DegreeEvaluation | null;
}

export function CreditHourTotalsView({ evaluation }: CreditHourTotalsViewProps) {
  const totals = useCreditHourTotals(evaluation);

  if (!totals) {
    return null;
  }

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

      <div className="bucket-totals-grid" data-testid="bucket-totals-grid">
        {totals.buckets.map((bucket) => (
          <div
            key={bucket.id}
            className="bucket-total-card"
            data-testid={`bucket-card-${bucket.id}`}
          >
            <div className="bucket-card-header">
              <h5>{bucket.label}</h5>
              <span className={`bucket-badge ${bucket.isSatisfied ? "satisfied" : "incomplete"}`}>
                {bucket.isSatisfied ? "Satisfied" : "Remaining"}
              </span>
            </div>
            {bucket.category && <p className="bucket-category">{bucket.category}</p>}
            <div className="bucket-metrics">
              <span data-testid={`bucket-progress-${bucket.id}`}>
                {bucket.fulfilledCredits} / {bucket.requiredCredits} credits
              </span>
              <span className="bucket-remaining" data-testid={`bucket-remaining-${bucket.id}`}>
                {bucket.remainingCredits} credits left
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
