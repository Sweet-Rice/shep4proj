/** Origin of the public LSU General Catalog (Acalog). */
export const CATALOG_ORIGIN = "https://catalog.lsu.edu";

/** Catalog and navigation ids of the 2026-2027 General Catalog. IDs change every catalog year. */
export const CATALOG_2026_2027 = {
  catalogYear: "2026-2027",
  catoid: "35",
  navoid: "3486",
} as const;

/**
 * The catalog course list is paginated at this many courses per page
 * (`filter[cpage]` selects the page).
 */
export const COURSE_LIST_PAGE_SIZE = 100;

/**
 * URL of the filtered course list page for one department prefix. The query
 * string is the exact shape the catalog's own course filter form submits (see
 * `fixtures/catalog/2026-2027/README.md`), with `filter[27]` set to the course
 * prefix and `filter[cpage]` to the 1-based page number.
 */
export function courseListUrl(o: {
  catoid: string;
  navoid: string;
  prefix: string;
  page: number;
}): string {
  const catoid = encodeURIComponent(o.catoid);
  const navoid = encodeURIComponent(o.navoid);
  const prefix = encodeURIComponent(o.prefix);
  const page = String(o.page);
  return (
    `${CATALOG_ORIGIN}/content.php?catoid=${catoid}&navoid=${navoid}` +
    `&filter[27]=${prefix}&filter[29]=&filter[course_type]=-1&filter[keyword]=` +
    `&filter[32]=1&filter[cpage]=${page}&cur_cat_oid=${catoid}&expand=&search_database=Filter`
  );
}

/** URL of one course's detail page, which needs no JavaScript to fetch. */
export function courseDetailUrl(o: { catoid: string; coid: string }): string {
  return `${CATALOG_ORIGIN}/preview_course_nopop.php?catoid=${encodeURIComponent(o.catoid)}&coid=${encodeURIComponent(o.coid)}`;
}
