/** One archived term from GET /courses/:id/history. */
export interface CourseOfferingHistory {
  term: string;
  sectionCount: number;
}

export interface TypicalTerm {
  season: "Fall" | "Spring" | "Summer";
  /** Number of distinct archived academic periods in which the course appeared. */
  termCount: number;
  years: number[];
  sectionCount: number;
}

const SEASONS = ["Fall", "Spring", "Summer"] as const;

/**
 * Summarizes observed offering seasons. The archive records offered terms only,
 * so this describes past appearances rather than a probability or guarantee of
 * a future offering. Online subterms count as distinct academic periods.
 */
export function typicalTerms(history: readonly CourseOfferingHistory[]): TypicalTerm[] {
  const unique = new Map<string, CourseOfferingHistory>();
  for (const entry of history) {
    if (entry.sectionCount > 0) unique.set(entry.term, entry);
  }

  const groups = new Map<
    TypicalTerm["season"],
    { terms: number; years: Set<number>; sections: number }
  >();
  for (const entry of unique.values()) {
    const match = /(?:^|_)(FALL|SPRING|SUMMER)(?:_[A-Z0-9]+)*_(20\d{2})$/.exec(entry.term);
    if (!match) continue;
    const season = (match[1]![0]! + match[1]!.slice(1).toLowerCase()) as TypicalTerm["season"];
    const group = groups.get(season) ?? { terms: 0, years: new Set<number>(), sections: 0 };
    group.terms++;
    group.years.add(Number(match[2]));
    group.sections += entry.sectionCount;
    groups.set(season, group);
  }
  return SEASONS.filter((season) => groups.has(season))
    .map((season) => {
      const group = groups.get(season)!;
      return {
        season,
        termCount: group.terms,
        years: [...group.years].sort((a, b) => a - b),
        sectionCount: group.sections,
      };
    })
    .sort(
      (a, b) => b.termCount - a.termCount || SEASONS.indexOf(a.season) - SEASONS.indexOf(b.season),
    );
}
