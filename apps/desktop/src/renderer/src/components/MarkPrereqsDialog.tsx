import { useEffect, useRef, type KeyboardEvent } from "react";
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
  const visible = isOpen && unfulfilledPrereqs.length > 0;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const trigger = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && onCancel) {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleKeyDown}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-prereqs-title"
      >
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
