import type { Section, Weekday } from "./section.js";

export interface SectionConflict {
  first: Section;
  second: Section;
  day: Weekday;
  startMinute: number;
  endMinute: number;
}

/** Returns each overlapping day and time window between distinct sections in the same term. */
export function findConflicts(sections: readonly Section[]): SectionConflict[] {
  const conflicts: SectionConflict[] = [];
  for (let firstIndex = 0; firstIndex < sections.length; firstIndex++) {
    const first = sections[firstIndex]!;
    for (let secondIndex = firstIndex + 1; secondIndex < sections.length; secondIndex++) {
      const second = sections[secondIndex]!;
      if (first.term !== second.term) continue;
      for (const firstMeeting of first.meetings) {
        for (const secondMeeting of second.meetings) {
          const startMinute = Math.max(firstMeeting.startMinute, secondMeeting.startMinute);
          const endMinute = Math.min(firstMeeting.endMinute, secondMeeting.endMinute);
          if (startMinute >= endMinute) continue;
          for (const day of firstMeeting.days) {
            if (!secondMeeting.days.includes(day)) continue;
            conflicts.push({ first, second, day, startMinute, endMinute });
          }
        }
      }
    }
  }
  return conflicts;
}
