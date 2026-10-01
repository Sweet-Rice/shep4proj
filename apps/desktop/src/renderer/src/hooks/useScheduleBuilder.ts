import { useMemo, useState } from "react";
import type { Section } from "@jevschedule/shared";

export function getSectionKey(section: Section): string {
  return `${section.courseCode}-${section.sectionNumber}`;
}

export function doMeetingsOverlap(
  m1: { startMinute: number; endMinute: number },
  m2: { startMinute: number; endMinute: number },
): boolean {
  return m1.startMinute < m2.endMinute && m2.startMinute < m1.endMinute;
}

export function findScheduleConflicts(sections: Section[]): Set<string> {
  const conflictingKeys = new Set<string>();

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const s1 = sections[i]!;
      const s2 = sections[j]!;

      let hasOverlap = false;

      for (const m1 of s1.meetings) {
        for (const m2 of s2.meetings) {
          const commonDays = m1.days.filter((day) => m2.days.includes(day));
          if (commonDays.length > 0 && doMeetingsOverlap(m1, m2)) {
            hasOverlap = true;
            break;
          }
        }
        if (hasOverlap) break;
      }

      if (hasOverlap) {
        conflictingKeys.add(getSectionKey(s1));
        conflictingKeys.add(getSectionKey(s2));
      }
    }
  }

  return conflictingKeys;
}

export function useScheduleBuilder(initialSections: Section[] = []) {
  const [sections, setSections] = useState<Section[]>(initialSections);

  const conflicts = useMemo(() => {
    return findScheduleConflicts(sections);
  }, [sections]);

  const addSection = (section: Section) => {
    const key = getSectionKey(section);
    setSections((prev) => {
      if (prev.some((s) => getSectionKey(s) === key)) {
        return prev;
      }
      return [...prev, section];
    });
  };

  const removeSection = (sectionKey: string) => {
    setSections((prev) => prev.filter((s) => getSectionKey(s) !== sectionKey));
  };

  const clearSchedule = () => {
    setSections([]);
  };

  return {
    sections,
    setSections,
    addSection,
    removeSection,
    clearSchedule,
    conflicts,
    hasConflicts: conflicts.size > 0,
  };
}
