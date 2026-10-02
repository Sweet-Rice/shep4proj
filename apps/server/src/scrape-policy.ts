/** Start (UTC midnight) of the LSU semester window containing `now`: Spring from Jan 1, Summer from Jun 1, Fall from Aug 1. Scraped data is refreshed at most once per window. */
export function currentSemesterStart(now: Date): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const startMonth = month <= 4 ? 0 : month <= 6 ? 5 : 7;
  return new Date(Date.UTC(year, startMonth, 1));
}
