# Transcript fixtures: LSU Workday transcript PDFs

Saved PDF fixtures generated from LSU Workday outputs for the transcript parser
engine (T-302, T-303). These fixtures provide realistic test inputs with genuine
layout and structural properties while perturbing quasi-identifying fields with
synthetic placeholder data.

See the wiki's [Data-Sources](https://github.com/Sweet-Rice/shep4proj/wiki/Data-Sources)
page for where these Workday outputs live.

## Files

All captured 2026-09-28 (UTC). The `.pdf` extension is marked `binary` in
`.gitattributes`, so git stores the bytes unchanged and the checksums below stay valid.

| File | Source | Format & Producer | Pages | sha256 |
|---|---|---|---|---|
| `academic-record-printable.redacted.pdf` | Workday "View My Academic Record" task (`task/2998$30300.htmld`) → "View printable version (PDF)" | PDF 1.7 (iText Core) | 9 | `7b391a867c6efc85b575fa7c2cec9f522c1a7d7b5d4a27df8712db839b933b0c` |
| `unofficial-transcript.redacted.pdf` | Workday "Generate Unofficial Transcript" task | PDF 1.5 (Workday BIRT Report Engine) | 3 | `9cbf78caa6e7d865ac398a66aa313f4fcccaa1559b645c9d8cfcceb3131b669a` |

## What each fixture covers

**`academic-record-printable.redacted.pdf`**:
- 9-page detailed academic record report listing all coursework chronologically by academic period (Fall Semester 2026, Spring Semester 2026, down through Spring Semester 2021) as well as transfer credit from exams.
- Displays course enrollment details across two-column tables (academic unit and enrollment details on the left; course code, section title, grade, grade points, credit hours, and earned grade points on the right).
- Includes academic period summary totals, cumulative totals, and institutional vs transfer credit totals.

**`unofficial-transcript.redacted.pdf`**:
- 3-page report output generated via Workday BIRT Report Engine.
- Contains header blocks with student academic unit and program of study, credit-by-exam tables (advanced standing), and semester-by-semester course listings with term and cumulative GPA summaries.

## What's real vs synthetic

- **Real:**
  - Layout, structure, and embedded fonts of the source documents.
  - Academic terms and chronological ordering.
  - Non-swapped course codes and titles.
  - Course credit hours and total hour allocations.
  - The advanced-standing credit-by-exam block.
  - LSU institutional header text, the LSU logo, table borders, and the "UNOFFICIAL" watermark.

- **Synthetic:**
  - Student Name: `Alex Sample`.
  - Student ID: `00012345` (8-digit zero-padded shape matching Workday format).
  - Date of Birth: `01/01` (MM/DD format matching the source, no birth year).
  - Program-of-study start date: synthetic date (`08/15/2022`) applied consistently across all occurrences.
  - Academic honors: normalized to "Good Standing" (honors and additional standings redacted).
  - Swapped courses: identifying, rare, or project-linked courses were swapped for common catalog courses of the same credit hours and row type (audit, withdrawal, in-progress, graded) from `fixtures/catalog/2026-2027/`, without naming the original courses. Replacement codes: `CSC 1240`, `CSC 4243`, `CSC 4332`, `CSC 4356`, `CSC 4402`, `CSC 4444`, `CSC 4501`, and `CSC 4562`.
  - Letter grades, grade points, GPAs, and quality point totals: recomputed using LSU's standard grading scale and quality point formulas to ensure every term and cumulative summary adds up and remains internally consistent across both documents.

## Note for parser authors

- Replacement text is rendered using standard PDF base-14 Helvetica (`helv`), so its font name and glyph metrics differ from the source documents' fonts. Replacements sit at the original glyph's baseline and size; where a synthetic value is longer, its font size was reduced slightly so it doesn't overlap surrounding text.
- Redaction removed only the glyphs of the replaced values. A per-glyph diff against the source (character, x position, baseline) shows every other glyph unchanged, and no inserted glyph overlaps a surviving one.

## Structure and metadata scrubbing

- Document metadata (`/Title`, `/Author`, `/Subject`, `/Keywords`, `/Creator`, `/Producer`, `/CreationDate`, `/ModDate`) and XMP metadata streams were cleared.
- Document outline bookmarks (TOC) carrying student identity strings were cleared.
- Trailer `/ID` arrays were regenerated so they differ from the source files.
- Non-essential catalog keys (`/AcroForm`, `/Names`, `/JavaScript`) were verified absent or scrubbed.
