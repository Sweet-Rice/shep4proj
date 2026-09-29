/** Origin of LSU's public Course Offerings portal (the section source chosen in T-005). */
export const SECTION_OFFERINGS_ORIGIN = "https://courseofferings.lsu.edu";

/** The portal's id for the LSU A&M campus (`University=` in listing URLs). */
export const LSU_UNIVERSITY_ID = "AU00000079";

/**
 * URL of a department's section listing. Without `periodId` it's the landing page, which has the
 * academic period picker but no sections; with one it lists that period's sections. The query
 * string matches the saved fixture's source URL (`fixtures/sections/fall-2026/README.md`).
 */
export function sectionListingUrl(o: { department: string; periodId?: string }): string {
  const url = new URL("/LSU", SECTION_OFFERINGS_ORIGIN);
  url.searchParams.set("University", LSU_UNIVERSITY_ID);
  url.searchParams.set("Department", o.department);
  if (o.periodId !== undefined) url.searchParams.set("AcademicPeriod", o.periodId);
  return url.href;
}
