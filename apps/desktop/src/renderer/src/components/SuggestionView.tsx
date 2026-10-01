import { useState } from "react";
import type { CourseCode } from "@jevschedule/shared";

export type SuggestionValidationStatus = "valid" | "invalid" | "pending";

export interface CourseSuggestion {
  code: CourseCode;
  title: string;
  rationale: string;
  status: SuggestionValidationStatus;
  validationReason?: string | null;
}

export const SAMPLE_SUGGESTIONS: CourseSuggestion[] = [
  {
    code: "CSC 1351",
    title: "Computer Science II for Majors",
    rationale: "Core requirement following CSC 1350 completion.",
    status: "valid",
  },
  {
    code: "MATH 1552",
    title: "Analytic Geometry and Calculus II",
    rationale: "Prerequisite for upper-level CSC courses.",
    status: "valid",
  },
  {
    code: "CSC 3102",
    title: "Advanced Data Structures",
    rationale: "Core computer science algorithm course.",
    status: "invalid",
    validationReason: "Prerequisite CSC 2250 is not yet completed.",
  },
];

export interface SuggestionViewProps {
  suggestions?: CourseSuggestion[];
  onAcceptCourse: (code: CourseCode) => void;
  onRejectCourse?: (code: CourseCode) => void;
}

export function SuggestionView({
  suggestions = SAMPLE_SUGGESTIONS,
  onAcceptCourse,
  onRejectCourse,
}: SuggestionViewProps) {
  const [items] = useState<CourseSuggestion[]>(suggestions);
  const [acceptedCodes, setAcceptedCodes] = useState<Set<CourseCode>>(new Set());
  const [rejectedCodes, setRejectedCodes] = useState<Set<CourseCode>>(new Set());

  const handleAccept = (code: CourseCode) => {
    setAcceptedCodes((prev) => new Set(prev).add(code));
    onAcceptCourse(code);
  };

  const handleReject = (code: CourseCode) => {
    setRejectedCodes((prev) => new Set(prev).add(code));
    if (onRejectCourse) {
      onRejectCourse(code);
    }
  };

  const activeSuggestions = items.filter((item) => !rejectedCodes.has(item.code));

  return (
    <div className="suggestion-view-container" data-testid="suggestion-view">
      <header className="suggestion-header">
        {" "}
        <h2>AI Advisor Course Suggestions</h2>{" "}
        <p className="suggestion-subtitle">
          {" "}
          Recommended courses for your next semester with rationale and eligibility status.{" "}
        </p>{" "}
      </header>

      {activeSuggestions.length === 0 ? (
        <p className="no-suggestions-message" data-testid="no-suggestions-message">
          {" "}
          No suggestions remaining. All courses accepted or rejected.{" "}
        </p>
      ) : (
        <ul className="suggestions-list" data-testid="suggestions-list">
          {" "}
          {activeSuggestions.map((item) => {
            const isAccepted = acceptedCodes.has(item.code);

            return (
              <li
                key={item.code}
                className={`suggestion-card status-${item.status} ${isAccepted ? "accepted" : ""}`}
                data-testid={`suggestion-card-${item.code}`}
              >
                {" "}
                <div className="card-top-row">
                  {" "}
                  <span className="suggestion-code">{item.code}</span>{" "}
                  <span className="suggestion-title">{item.title}</span>{" "}
                  <span
                    className={`validation-status-badge status-${item.status}`}
                    data-testid={`status-badge-${item.code}`}
                  >
                    {" "}
                    {item.status === "valid"
                      ? "Eligible"
                      : item.status === "invalid"
                        ? "Ineligible"
                        : "Checking"}{" "}
                  </span>{" "}
                </div>{" "}
                <p className="suggestion-rationale">
                  {" "}
                  <strong>Rationale:</strong> {item.rationale}{" "}
                </p>{" "}
                {item.status === "invalid" && item.validationReason && (
                  <p
                    className="validation-error-reason"
                    data-testid={`validation-reason-${item.code}`}
                  >
                    {" "}
                    ⚠ {item.validationReason}{" "}
                  </p>
                )}{" "}
                <div className="suggestion-card-actions">
                  {" "}
                  <button
                    type="button"
                    className={`btn btn-sm ${isAccepted ? "btn-success" : "btn-primary"}`}
                    onClick={() => handleAccept(item.code)}
                    disabled={isAccepted || item.status === "invalid"}
                    data-testid={`accept-course-${item.code}`}
                  >
                    {" "}
                    {isAccepted ? "Added to Plan" : "Accept into Plan"}{" "}
                  </button>{" "}
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => handleReject(item.code)}
                    data-testid={`reject-course-${item.code}`}
                  >
                    {" "}
                    Reject{" "}
                  </button>{" "}
                </div>{" "}
              </li>
            );
          })}{" "}
        </ul>
      )}
    </div>
  );
}
