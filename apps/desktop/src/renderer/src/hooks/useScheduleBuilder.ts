import { findConflicts, type Section } from "@jevschedule/shared";
import { useMemo, useState } from "react";

export function getSectionKey(section: Section): string {
  return `${section.term}|${section.courseCode}|${section.sectionNumber}|${section.sectionType}`;
}

export function useScheduleBuilder(initialSections: Section[] = []) {
  const [sections, setSections] = useState<Section[]>(initialSections);

  const conflicts = useMemo(() => {
    const keys = new Set<string>();
    for (const conflict of findConflicts(sections)) {
      keys.add(getSectionKey(conflict.first));
      keys.add(getSectionKey(conflict.second));
    }
    return keys;
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
