# Prerequisite Corpus: CSC (2026-2027 General Catalog)

Extracted prerequisite corpus and pattern classification tags for all 91 Computer Science (CSC) courses in the Louisiana State University (LSU) 2026-2027 General Catalog (`catoid=35`).

- **Source:** LSU 2026-2027 General Catalog (`catalog.lsu.edu`, `catoid=35`)
- **Capture Date:** 2026-09-29
- **Regeneration Command:**
  ```bash
  pnpm --filter @jevschedule/scraper capture:prereqs -- --cache <cache-dir>
  ```

Raw HTML course detail pages fetched from `catalog.lsu.edu` are cached locally in `<cache-dir>` to support resumable capture without redundant network traffic. These raw HTML files are not committed to git; only the extracted `corpus.json` is checked in.

## Pattern Tags

Prerequisite texts are tagged using heuristic rules defined in `PREREQ_PATTERN_TAGS`:

- `single`: exactly one course code with no `and`, no `or`, and no semicolon.
- `and-list`: comma-separated course codes or explicit `and` conjunction (without mixed and/or).
- `or-list`: `or` conjunction between alternatives (without mixed and/or).
- `semicolon-groups`: prerequisite text contains one or more semicolons separating clauses.
- `mixed-and-or`: at least one semicolon group contains both `and` and `or` conjunctions.
- `coreq`: corequisite wording such as "credit or registration in" or "concurrent enrollment in".
- `min-grade`: minimum grade requirement such as "C or better" or "grade of C".
- `non-course`: non-course requirement such as permission, consent, standing, or admission.
- `non-csc`: prerequisite includes one or more course codes with department prefix other than `CSC`.
- `other`: fallback applied when no other heuristic tag matches.
