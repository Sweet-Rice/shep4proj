# Catalog fixtures: 2026-2027 General Catalog

Saved HTML from the public LSU catalog (`catalog.lsu.edu`, Acalog, `catoid=35`) for
the scraper parsers (T-102, T-103) and the degree encoding (T-122). Public pages only,
with no login and no student data. See the wiki's
[Data-Sources → Catalog findings](https://github.com/Sweet-Rice/shep4proj/wiki/Data-Sources#catalog-findings-t-001)
for how the site behaves.

The original CSC files are raw HTTP response bodies; the additional fixtures
captured 2026-10-02 are trimmed to parser-relevant list rows or detail-page
markup. Files are marked `-text` in `.gitattributes` so their checksums stay stable.

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

**Parser-gap fixtures**, captured 2026-10-02 (UTC):

| File | Source URL | sha256 |
|---|---|---|
| `chem-course-list.html` | `https://catalog.lsu.edu/content.php?catoid=35&navoid=3486&filter[27]=CHEM&filter[29]=&filter[course_type]=-1&filter[keyword]=&filter[32]=1&filter[cpage]=1&cur_cat_oid=35&expand=&search_database=Filter` | `6cb905e63b30af1afa86cd4d33df17e14851bc31d4e7e006c8b81a2bf6a773fd` |
| `ee-course-list-page-2.html` | `https://catalog.lsu.edu/content.php?catoid=35&navoid=3486&filter[27]=EE&filter[29]=&filter[course_type]=-1&filter[keyword]=&filter[32]=1&filter[cpage]=2&cur_cat_oid=35&expand=&search_database=Filter` | `7b0943e528e6105ad2dca8436e431b32e3479d3f6d1d9fa83467eaeac5eec18b` |
| `course-chem-1101.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=236828` | `005da5d1b5d53d411c5777f990e71b4b0cd53daf32686d50a18a6f19ff5d49e0` |
| `course-ee-7422.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=232129` | `d635a18985bf35884cfd7adac008acc39beb9bf225c7f6c465826e28baa1a929` |
| `course-phys-7353.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=231474` | `dc546995bd3533f0fe7d170bb21baf4eba7e5697b8b53efeedbaeb15276b54b8` |
| `course-biol-4801.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=233013` | `447f4cdf8736853196262dede674e15dbfd945f516b8ba28b103a3073e1f07c2` |
| `hist-course-list.html` | `https://catalog.lsu.edu/content.php?catoid=35&navoid=3486&filter[27]=HIST&filter[29]=&filter[course_type]=-1&filter[keyword]=&filter[32]=1&filter[cpage]=1&cur_cat_oid=35&expand=&search_database=Filter` | `bf4752148e8b37696d77731972fc963b3f088fc4f57e77b99a86a7b5dad5ff8a` |
| `course-thtr-7900.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=231970` | `10c62df2213ea78f090115d34d16a1d1df86607c3184393e9977cf4dde82ba90` |
| `econ-course-list.html` | `https://catalog.lsu.edu/content.php?catoid=35&navoid=3486&filter[27]=ECON&filter[29]=&filter[course_type]=-1&filter[keyword]=&filter[32]=1&filter[cpage]=1&cur_cat_oid=35&expand=&search_database=Filter` | `ac1c5c970b47d526b2b18810b34566ecfba9c551624420b88a769c3da3fe8079` |
| `course-hist-2025.html` | `https://catalog.lsu.edu/preview_course_nopop.php?catoid=35&coid=233254` | `ee5ce6ed8a43bd59386465f27d8f3749e471bf579c413ad5bbd1406001763da5` |

## What each fixture covers

**`csc-course-list.html`**: all 91 CSC courses in the 2026-2027 catalog, on one
page (no pagination). Rows are grouped under `<h2>` headings for the owning
department: `Biological Sciences` (1: CSC 3605) comes before `Computer Science` (90).
Each row is `<a href="preview_course_nopop.php?catoid=35&coid=<coid>" …>CSC 1350 Computer Science I for Majors (4)</a>`.
Credits include ranges and free text: `(1-3)`, `(1-12)`, `(1-12 per sem.)`.

**Course detail pages.** The five CSC pages below cover different prerequisite
patterns; THTR 7900 covers an empty prerequisite label:

| Course | Prereq text (as rendered) | Why it's here |
|---|---|---|
| CSC 1350 | credit or registration in MATH 1022 or MATH 1023 or MATH 1550 or MATH 1551 or MATH 1552. | Coreq wording ("credit or registration in"), long OR chain, a following "Credit will not be given for…" **exclusion** sentence that also links courses, contact hours before the description |
| CSC 2700 | CSC 1254 or CSC 1351 or permission of department. | Non-course alternative inside an OR, variable credits `(1-3)`, repeat-limit note that links other courses (CSC 3700, CSC 4700) |
| CSC 3102 | CSC 1254 or CSC 1351 and credit or concurrent enrollment in CSC 2259 or EE 2741. | Mixed `or`/`and` with no grouping, a second coreq wording ("credit or concurrent enrollment in"), non-CSC prefix |
| CSC 3200 | ENGL 1005 or ENGL 2000 or HNRS 2000; CSC 3102. | `;` separating AND groups, a "For majors only." restriction |
| THTR 7900 | none (the `Prereq.:` label is followed by an empty value) | validates handling of optional empty prerequisite labels |
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
- The original detail fixtures were fetched with plain HTTP. The 2026-10-02
  parser-gap pages were fetched through Edge/Chromium so the bounded capture used
  one browser route for every request; THTR 7900 was fetched through Edge after a
  plain-HTTP attempt returned an empty body.
- The original capture used the `robots.txt` 120-second crawl delay. The
  authorized 2026-10-02 fixture captures used at least two seconds between page
  requests and refused `/ajax/` URLs.

To refresh for a new catalog year, capture the same pages under a new
`fixtures/catalog/<year>/` directory, taking the current `catoid`/`coid`/`poid`
from the site. IDs change every catalog year. Keep the 120 s spacing and update
this table.
