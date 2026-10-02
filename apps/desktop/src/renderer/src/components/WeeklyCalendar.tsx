import type { CSSProperties } from "react";
import { findConflicts, type Section, type Weekday } from "@jevschedule/shared";
import { getSectionKey } from "../hooks/useScheduleBuilder.js";
import { assignMeetingLanes } from "./meeting-lanes.js";

const COURSE_TONE_COUNT = 4;

export const CALENDAR_DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export interface WeeklyCalendarProps {
  sections: Section[];
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

/** Compact range such as "10:30–11:50 AM", repeating the meridiem only when it changes. */
export function formatTimeRange(startMinute: number, endMinute: number): string {
  const [start, startMeridiem] = formatMinuteToTime(startMinute).split(" ");
  const [end, endMeridiem] = formatMinuteToTime(endMinute).split(" ");
  return startMeridiem === endMeridiem
    ? `${start}–${end} ${endMeridiem}`
    : `${start} ${startMeridiem}–${end} ${endMeridiem}`;
}

/** Meetings shorter than this have no room for a location line. */
const MIN_LOCATION_MINUTES = 75;

interface CalendarMeetingSlot {
  section: Section;
  day: Weekday;
  startMinute: number;
  endMinute: number;
  laneIndex: number;
  laneCount: number;
}

export function WeeklyCalendar({
  sections,
  conflictingSectionKeys,
  onRemoveSection,
  startHour: minStartHour = 8,
  endHour: minEndHour = 18,
}: WeeklyCalendarProps) {
  // Widen the default range so evening or early meetings are never drawn outside the grid.
  // Only meetings on drawn days count; weekend meetings never appear.
  const meetings = sections.flatMap((section) =>
    section.meetings.filter((meeting) => meeting.days.some((day) => CALENDAR_DAYS.includes(day))),
  );
  const startHour = Math.min(
    minStartHour,
    ...meetings.map((meeting) => Math.floor(meeting.startMinute / 60)),
  );
  const endHour = Math.max(
    minEndHour,
    ...meetings.map((meeting) => Math.ceil(meeting.endMinute / 60)),
  );
  const conflicts =
    conflictingSectionKeys ??
    new Set(
      findConflicts(sections).flatMap(({ first, second }) => [
        getSectionKey(first),
        getSectionKey(second),
      ]),
    );

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
            laneIndex: 0,
            laneCount: 1,
          });
        }
      });
    });
  });

  for (const day of CALENDAR_DAYS) {
    const slotsForDay = meetingSlots.filter((slot) => slot.day === day);
    const assignedLanes = assignMeetingLanes(slotsForDay);
    slotsForDay.forEach((slot, index) => {
      slot.laneIndex = assignedLanes[index]!.laneIndex;
      slot.laneCount = assignedLanes[index]!.laneCount;
    });
  }

  const totalCredits = sections.reduce((sum, section) => sum + section.credits.min, 0);
  const courseTones = new Map(
    [...new Set(sections.map((section) => section.courseCode))]
      .sort()
      .map((code, index) => [code, index % COURSE_TONE_COUNT]),
  );

  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) {
    hours.push(h);
  }

  return (
    <div className="weekly-calendar-container" data-testid="weekly-calendar">
      <header className="calendar-header">
        <h2>Weekly Schedule</h2>
        <p className="calendar-subtitle">
          {sections.length} section{sections.length === 1 ? "" : "s"} · {totalCredits} credit
          {totalCredits === 1 ? "" : "s"}
        </p>
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

      <div
        className="calendar-grid"
        role="region"
        aria-label="Weekly class schedule time grid"
        style={{ "--hours": endHour - startHour } as CSSProperties}
      >
        <div className="grid-header-corner" aria-hidden="true" />

        {CALENDAR_DAYS.map((day, i) => (
          <div
            key={day}
            className="grid-header-day"
            data-testid={`day-header-${day}`}
            style={{ gridColumn: i + 2 }}
          >
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

        {CALENDAR_DAYS.map((day, i) => {
          const slotsForDay = meetingSlots.filter((s) => s.day === day);

          return (
            <div
              key={day}
              className="day-column"
              data-testid={`day-column-${day}`}
              style={{ gridColumn: i + 2 }}
            >
              {slotsForDay.map((slot, idx) => {
                const topPercent = ((slot.startMinute - startMinuteTotal) / totalMinutes) * 100;
                const heightPercent = ((slot.endMinute - slot.startMinute) / totalMinutes) * 100;

                const { section } = slot;
                const key = getSectionKey(section);
                const isConflict = conflicts.has(key);

                return (
                  <div
                    key={`${section.courseCode}-${section.sectionNumber}-${day}-${idx}`}
                    className={`meeting-block tone-${courseTones.get(section.courseCode)} ${slot.laneCount > 1 ? "multi-lane" : ""} ${isConflict ? "conflict" : ""}`}
                    data-testid={`meeting-block-${section.courseCode}-${day}`}
                    title={[
                      `${section.courseCode} ${section.sectionNumber}-${section.sectionType}`,
                      formatTimeRange(slot.startMinute, slot.endMinute),
                      section.location,
                      section.instructor,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                    style={{
                      top: `${Math.max(0, topPercent)}%`,
                      height: `${Math.max(4, heightPercent)}%`,
                      left: `calc(${(slot.laneIndex * 100) / slot.laneCount}% + 2px)`,
                      width: `calc(${100 / slot.laneCount}% - 4px)`,
                    }}
                  >
                    <div className="block-header">
                      <span className="block-title">
                        {section.courseCode}
                        <span className="block-section">
                          {" "}
                          · {section.sectionNumber}-{section.sectionType}
                        </span>
                      </span>
                      {isConflict && (
                        <span
                          className="conflict-badge"
                          data-testid={`conflict-badge-${key}`}
                          aria-label="Conflict"
                        >
                          <span aria-hidden="true">⚠</span>
                        </span>
                      )}
                    </div>

                    <div className="block-time">
                      {formatTimeRange(slot.startMinute, slot.endMinute)}
                    </div>
                    {section.location &&
                      slot.endMinute - slot.startMinute >= MIN_LOCATION_MINUTES && (
                        <div className="block-location">{section.location}</div>
                      )}

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
