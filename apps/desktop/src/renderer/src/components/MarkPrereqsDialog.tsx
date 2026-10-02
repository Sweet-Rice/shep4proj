import type { KeyboardEvent } from "react";
import type { CourseCode } from "@jevschedule/shared";

export interface MarkPrereqsDialogProps {
  isOpen: boolean;
  targetCourse: CourseCode;
  unfulfilledPrereqs: CourseCode[];
  onAccept: (targetCourse: CourseCode, prereqs: CourseCode[]) => void;
  onDecline: (targetCourse: CourseCode) => void;
  onCancel?: () => void;
}

export function MarkPrereqsDialog({
  isOpen,
  targetCourse,
  unfulfilledPrereqs,
  onAccept,
  onDecline,
  onCancel,
}: MarkPrereqsDialogProps) {
  if (!isOpen || unfulfilledPrereqs.length === 0) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && onCancel) {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      className="modal-backdrop"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mark-prereqs-title"
    >
      <div className="modal-card">
        <h3 id="mark-prereqs-title">Also mark prerequisites as completed?</h3>
        <p className="dialog-message">
          <strong>{targetCourse}</strong> has {unfulfilledPrereqs.length} prerequisite
          {unfulfilledPrereqs.length > 1 ? "s" : ""} not currently marked as completed:
        </p>
        <ul className="prereq-list">
          {unfulfilledPrereqs.map((code) => (
            <li key={code} className="prereq-item">
              {code}
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="accept-prereqs-btn"
            onClick={() => onAccept(targetCourse, unfulfilledPrereqs)}
          >
            Mark All Completed
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="decline-prereqs-btn"
            onClick={() => onDecline(targetCourse)}
          >
            Mark Only {targetCourse}
          </button>
          {onCancel && (
            <button
              type="button"
              className="btn btn-ghost"
              data-testid="cancel-prereqs-btn"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
