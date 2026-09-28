# Catalog fixtures: 2026-2027 General Catalog

Saved HTML from the public LSU catalog (`catalog.lsu.edu`, Acalog, `catoid=35`) for
the scraper parsers (T-102, T-103) and the degree encoding (T-122). Public pages only,
with no login and no student data. See the wiki's
[Data-Sources → Catalog findings](https://github.com/Sweet-Rice/shep4proj/wiki/Data-Sources#catalog-findings-t-001)
for how the site behaves.

Each file is the **raw HTTP response body** exactly as LSU served it, not a
browser-serialized DOM. The files are marked `-text` in `.gitattributes`, so git
stores the bytes unchanged and the checksums below stay valid.

## Files

All captured 2026-09-24 (UTC).

| File | Source URL | Captured | sha256 |
|---|---|---|---|
| `csc-course-list.html` | `https://catalog.lsu.edu/content.php?catoid=35&navoid=3486&filter[27]=CSC&filter[29]=&filter[course_type]=-1&filter[keyword]=&filter[32]=1&filter[cpage]=1&cur_cat_oid=35&expand=&search_database=Filter` | 23:49Z | `2efd5fb92d639de11d1e3b840f54e354064a85835746bc66d939f370c8f10be2` |
| `course-csc-1350.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=229578` | 23:25Z | `7278b44293a0ec2f058bb9645fa87c7dcf78243d1720b3de315aaba2bd5cb934` |
| `course-csc-2700.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=229586` | 23:46Z | `b67df36197be292c4af03519aa9ecb6af564d3dbc371b862f2f0eaa6af1c3d56` |
| `course-csc-3102.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=229589` | 23:34Z | `b85bbf7b673c3e0d9e96a311257e9ca6c5749013042db08b3152b07ede1ab97a` |
| `course-csc-3200.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=233370` | 23:42Z | `dbb69e83689b38c1431908c704f3d8a6038d342424f27f95b2537df324b56ee8` |
| `course-csc-4330.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=232623` | 23:20Z | `cf7e5881442734d71fdbf226d0540818bf9361994a06565548119b790dccf08b` |
| `program-computer-science-bs.html` | `https://catalog.lsu.edu/preview_program.php?catoid=35&poid=14278` | 23:51Z | `62fbe087845f6288802001e1c3e9f63fa3453abdafef3dd21519697c278073c5` |

## What each fixture covers

**`csc-course-list.html`**: all 91 CSC courses in the 2026-2027 catalog, on one
page (no pagination). Rows are grouped under `<h2>` headings for the owning
department: `Biological Sciences` (1: CSC 3605) comes before `Computer Science` (90).
Each row is `<a href="preview_course_nopop.php?catoid=35&coid=<coid>" …>CSC 1350 Computer Science I for Majors (4)</a>`.
Credits include ranges and free text: `(1-3)`, `(1-12)`, `(1-12 per sem.)`.

**Course detail pages.** Five pages, each picked for a different prereq pattern:

| Course | Prereq text (as rendered) | Why it's here |
|---|---|---|
| CSC 1350 | credit or registration in MATH 1022 or MATH 1023 or MATH 1550 or MATH 1551 or MATH 1552. | Coreq wording ("credit or registration in"), long OR chain, a following "Credit will not be given for…" **exclusion** sentence that also links courses, contact hours before the description |
| CSC 2700 | CSC 1254 or CSC 1351 or permission of department. | Non-course alternative inside an OR, variable credits `(1-3)`, repeat-limit note that links other courses (CSC 3700, CSC 4700) |
| CSC 3102 | CSC 1254 or CSC 1351 and credit or concurrent enrollment in CSC 2259 or EE 2741. | Mixed `or`/`and` with no grouping, a second coreq wording ("credit or concurrent enrollment in"), non-CSC prefix |
| CSC 3200 | ENGL 1005 or ENGL 2000 or HNRS 2000; CSC 3102. | `;` separating AND groups, a "For majors only." restriction |
| CSC 4330 | CSC 3102, CSC 3380. | Plain comma-separated AND list (baseline) |

On detail pages, each referenced course is an `<a>` with
`aria-label="View course details for <CODE>"` and `href="preview_course_nopop.php?catoid=35&coid=<coid>"`.
Each link is followed by a hidden `<span style="display: none !important">&#160;</span>`,
so text extraction has to collapse whitespace.

**`program-computer-science-bs.html`**: Computer Science, B.S., with all five
concentrations (Cloud Computing and Networking, Computer Science & Second Discipline,
Cybersecurity, Data Science and Analytics, Software Engineering). Each concentration
has a critical-requirements block and `Semester 1`–`Semester 8` `<h4>` headings with
107 `<li class="acalog-course">` items in total. On this page the course `coid` is in
`onClick="showCourse('35', '<coid>', …)"`; the `href` is `#`. Cybersecurity's critical
requirements text has no "CRITICAL REQUIREMENTS" heading.

## How these were captured

- `content.php` and `preview_program.php` answer plain HTTP clients with an AWS WAF
  JavaScript challenge (`202`, empty body). These two were loaded in headless
  Chromium through `playwright-core`, which passed the challenge, and the body of the
  final `200` document response was saved.
- `preview_course_nopop.php` needs no JavaScript. Those pages were fetched with plain
  HTTP.
- `robots.txt` sets `Crawl-delay: 120` and disallows `/ajax/`, so requests were
  spaced at least 120 s apart and no `/ajax/` URL was fetched.

To refresh for a new catalog year, capture the same pages under a new
`fixtures/catalog/<year>/` directory, taking the current `catoid`/`coid`/`poid`
from the site. IDs change every catalog year. Keep the 120 s spacing and update
this table.
