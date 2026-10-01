import type { CourseCode } from "@jevschedule/shared";

export interface CourseCompletionToggleProps {
  courseId: CourseCode;
  isCompleted: boolean;
  onToggle: (courseId: CourseCode) => void;
  label?: string;
  disabled?: boolean;
}

export function CourseCompletionToggle({
  courseId,
  isCompleted,
  onToggle,
  label,
  disabled = false,
}: CourseCompletionToggleProps) {
  return (
    <label className="completion-toggle">
      <input
        type="checkbox"
        checked={isCompleted}
        disabled={disabled}
        onChange={() => onToggle(courseId)}
        aria-label={label ?? `${courseId} completed`}
      />
      {label && <span>{label}</span>}
    </label>
  );
}
