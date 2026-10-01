import type { Section, Weekday } from "@jevschedule/shared";
import { findScheduleConflicts, getSectionKey } from "../hooks/useScheduleBuilder.js";

export const CALENDAR_DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export interface WeeklyCalendarProps {
  sections?: Section[];
  conflictingSectionKeys?: Set<string>;
  onRemoveSection?: (sectionKey: string) => void;
  startHour?: number; // 8 = 8 AM (480 mins)
  endHour?: number; // 18 = 6 PM (1080 mins)
}

export function formatMinuteToTime(minutesAfterMidnight: number): string {
  const h = Math.floor(minutesAfterMidnight / 60);
  const m = minutesAfterMidnight % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  const displayMin = m < 10 ? `0${m}` : `${m}`;
  return `${displayHour}:${displayMin} ${ampm}`;
}

export const SAMPLE_SECTIONS: Section[] = [
  {
    term: "LSUAM_FALL_2026",
    courseCode: "CSC 1350",
    sectionNumber: "001",
    sectionType: "LEC",
    credits: { min: 3, max: 3, note: null },
    instructor: "Dr. Duncan",
    location: "Coates 0214",
    deliveryMode: "In Person",
    enrollment: 45,
    capacity: 50,
    meetings: [{ days: ["Mon", "Wed", "Fri"], startMinute: 540, endMinute: 600 }],
  },
  {
    term: "LSUAM_FALL_2026",
    courseCode: "MATH 1550",
    sectionNumber: "002",
    sectionType: "LEC",
    credits: { min: 5, max: 5, note: null },
    instructor: "Dr. Smith",
    location: "Lockett 0101",
    deliveryMode: "In Person",
    enrollment: 38,
    capacity: 40,
    meetings: [{ days: ["Tue", "Thu"], startMinute: 630, endMinute: 720 }],
  },
  {
    term: "LSUAM_FALL_2026",
    courseCode: "ENGL 1001",
    sectionNumber: "005",
    sectionType: "LEC",
    credits: { min: 3, max: 3, note: null },
    instructor: "Prof. Davis",
    location: "Allen 0112",
    deliveryMode: "In Person",
    enrollment: 24,
    capacity: 25,
    meetings: [{ days: ["Mon", "Wed"], startMinute: 810, endMinute: 870 }],
  },
];

interface CalendarMeetingSlot {
  section: Section;
  day: Weekday;
  startMinute: number;
  endMinute: number;
}

export function WeeklyCalendar({
  sections = SAMPLE_SECTIONS,
  conflictingSectionKeys,
  onRemoveSection,
  startHour = 8,
  endHour = 18,
}: WeeklyCalendarProps) {
  const conflicts = conflictingSectionKeys ?? findScheduleConflicts(sections);

  const startMinuteTotal = startHour * 60;
  const endMinuteTotal = endHour * 60;
  const totalMinutes = endMinuteTotal - startMinuteTotal;

  const meetingSlots: CalendarMeetingSlot[] = [];
  sections.forEach((section) => {
    section.meetings.forEach((meeting) => {
      meeting.days.forEach((day) => {
        if (CALENDAR_DAYS.includes(day)) {
          meetingSlots.push({
            section,
            day,
            startMinute: meeting.startMinute,
            endMinute: meeting.endMinute,
          });
        }
      });
    });
  });

  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) {
    hours.push(h);
  }

  return (
    <div className="weekly-calendar-container" data-testid="weekly-calendar">
      <header className="calendar-header">
        <h2>Weekly Schedule</h2>
        <p className="calendar-subtitle">Mon–Fri Class Time Grid</p>
        {conflicts.size > 0 && (
          <div
            role="alert"
            className="conflict-alert-banner"
            data-testid="schedule-conflict-banner"
          >
            ⚠ Schedule Conflict Detected ({conflicts.size} section{conflicts.size > 1 ? "s" : ""}{" "}
            overlap)
          </div>
        )}
      </header>

      <div className="calendar-grid" role="region" aria-label="Weekly class schedule time grid">
        <div className="grid-header-corner" aria-hidden="true" />

        {CALENDAR_DAYS.map((day) => (
          <div key={day} className="grid-header-day" data-testid={`day-header-${day}`}>
            {day}
          </div>
        ))}

        {hours.map((hour) => {
          const hourMinute = hour * 60;
          const topPercent = ((hourMinute - startMinuteTotal) / totalMinutes) * 100;

          return (
            <div
              key={hour}
              className="time-label"
              style={{ top: `${topPercent}%` }}
              data-testid={`time-label-${hour}`}
            >
              {formatMinuteToTime(hourMinute)}
            </div>
          );
        })}

        {CALENDAR_DAYS.map((day) => {
          const slotsForDay = meetingSlots.filter((s) => s.day === day);

          return (
            <div key={day} className="day-column" data-testid={`day-column-${day}`}>
              {slotsForDay.map((slot, idx) => {
                const topPercent = ((slot.startMinute - startMinuteTotal) / totalMinutes) * 100;
                const heightPercent = ((slot.endMinute - slot.startMinute) / totalMinutes) * 100;

                const { section } = slot;
                const key = getSectionKey(section);
                const isConflict = conflicts.has(key);

                return (
                  <div
                    key={`${section.courseCode}-${section.sectionNumber}-${day}-${idx}`}
                    className={`meeting-block ${isConflict ? "conflict" : ""}`}
                    data-testid={`meeting-block-${section.courseCode}-${day}`}
                    style={{
                      top: `${Math.max(0, topPercent)}%`,
                      height: `${Math.max(4, heightPercent)}%`,
                    }}
                  >
                    <div className="block-header">
                      <span className="block-title">{section.courseCode}</span>
                      {isConflict && (
                        <span className="conflict-badge" data-testid={`conflict-badge-${key}`}>
                          ⚠ Conflict
                        </span>
                      )}
                    </div>

                    <div className="block-sub">
                      {section.sectionNumber}-{section.sectionType}
                    </div>
                    {section.location && <div className="block-location">{section.location}</div>}
                    <div className="block-time">
                      {formatMinuteToTime(slot.startMinute)} – {formatMinuteToTime(slot.endMinute)}
                    </div>

                    {onRemoveSection && (
                      <button
                        type="button"
                        className="btn btn-xs btn-remove-section"
                        onClick={() => onRemoveSection(key)}
                        aria-label={`Remove section ${section.courseCode} ${section.sectionNumber}`}
                        data-testid={`remove-section-${key}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
