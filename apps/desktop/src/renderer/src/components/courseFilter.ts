/** Case-insensitive match on code or title; "csc1350", "CSC 1350" and "intro prog" all work. */
export function matchesCourseQuery(
  course: { code: string; title: string },
  query: string,
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const code = course.code.toLowerCase();
  const haystack = `${code} ${code.replace(/\s+/g, "")} ${course.title.toLowerCase()}`;
  return terms.every((term) => haystack.includes(term));
}
