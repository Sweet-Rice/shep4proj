import {
  findConflicts,
  type AcademicPeriodId,
  type CourseCode,
  type Section,
} from "@jevschedule/shared";
import { getSectionKey } from "../hooks/useScheduleBuilder.js";
import { formatMinuteToTime } from "./WeeklyCalendar.js";

export interface SectionListProps {
  courseCode: CourseCode;
  sections: readonly Section[];
  term?: AcademicPeriodId;
  onAddSection?: (section: Section) => void;
  /** Sections already on the calendar; sections that overlap them are flagged. */
  scheduledSections?: readonly Section[];
  onRemoveCourse?: () => void;
}

/** Sections supplied by the course offerings API for one course. */
export function SectionList({
  courseCode,
  sections,
  term,
  onAddSection,
  scheduledSections = [],
  onRemoveCourse,
}: SectionListProps) {
  const scheduledKeys = new Set(scheduledSections.map(getSectionKey));
  const clashesFor = (section: Section): string[] => {
    if (scheduledKeys.has(getSectionKey(section))) return [];
    const labels = findConflicts([...scheduledSections, section])
      .filter(({ first, second }) => first === section || second === section)
      .map(({ first, second }) => {
        const other = first === section ? second : first;
        return `${other.courseCode} ${other.sectionNumber}`;
      });
    return [...new Set(labels)];
  };
  const visible = sections
    .filter((section) => section.courseCode === courseCode && (!term || section.term === term))
    .sort(
      (a, b) =>
        a.term.localeCompare(b.term) ||
        a.sectionNumber.localeCompare(b.sectionNumber) ||
        a.sectionType.localeCompare(b.sectionType),
    );

  return (
    <section className="section-list" aria-label={`Sections for ${courseCode}`}>
      <div className="section-list-header">
        <h2>Sections for {courseCode}</h2>
        {onRemoveCourse && (
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={onRemoveCourse}
            aria-label={`Remove ${courseCode}`}
          >
            Remove
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="muted">No sections listed for this term.</p>
      ) : (
        <ul className="section-list-items">
          {visible.map((section) => {
            const key = `${section.term}-${section.courseCode}-${section.sectionNumber}-${section.sectionType}`;
            const available = Math.max(0, section.capacity - section.enrollment);
            const clashes = clashesFor(section);
            const onSchedule = scheduledKeys.has(getSectionKey(section));
            return (
              <li
                key={key}
                className={`section-list-item ${clashes.length > 0 ? "conflict" : ""} ${onSchedule ? "scheduled" : ""}`}
              >
                <div className="section-list-heading">
                  <h3>
                    {section.sectionNumber}-{section.sectionType}
                  </h3>
                  <span className={`badge ${available === 0 ? "badge-danger" : "badge-success"}`}>
                    {available === 0 ? "Closed" : "Open"}
                  </span>
                </div>
                <p>
                  {section.credits.min === section.credits.max
                    ? `${section.credits.min} credits`
                    : `${section.credits.min}–${section.credits.max} credits`}
                  {section.deliveryMode ? ` · ${section.deliveryMode}` : ""}
                </p>
                <p className="section-list-meta">{section.instructor ?? "Instructor TBA"}</p>
                <p className="section-list-meta">{section.location ?? "Location TBA"}</p>
                {section.meetings.length === 0 ? (
                  <p>Meeting time TBA</p>
                ) : (
                  <ul className="section-list-meetings">
                    {section.meetings.map((meeting, index) => (
                      <li key={index}>
                        {meeting.days.join(", ")} {formatMinuteToTime(meeting.startMinute)}–
                        {formatMinuteToTime(meeting.endMinute)}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="section-list-seats" aria-label={`${available} seats available`}>
                  {available === 0
                    ? "Full"
                    : `${available} seat${available === 1 ? "" : "s"} available`}
                </p>
                {clashes.length > 0 && (
                  <p className="section-list-conflict">Time conflict with {clashes.join(", ")}</p>
                )}
                {onAddSection && section.meetings.length > 0 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => onAddSection(section)}
                  >
                    Add to schedule
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
