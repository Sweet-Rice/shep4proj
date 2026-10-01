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
    <label
      className={`flex items-center space-x-2 ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={isCompleted}
        disabled={disabled}
        onChange={() => onToggle(courseId)}
        className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 transition duration-150 ease-in-out"
        aria-label={`Mark ${courseId} as ${isCompleted ? "incomplete" : "complete"}`}
      />
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
    </label>
  );
}
