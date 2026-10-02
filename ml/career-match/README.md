# career-match: career path -> LSU courses (research prototype, T-640)

Offline Python prototype (outside the pnpm workspace) that answers: given a free-text career
("game developer", "data scientist at a bank"), which catalog courses are most related, and why?
Nothing here runs in the app yet. Datasets, caches, model weights and the catalog dump are git-ignored.

```
cd ml/career-match
uv sync
uv run python scripts/fetch_data.py      # O*NET 31.0, NCES crosswalk, public catalog -> data/ (once)
uv run python scripts/run_eval.py        # metrics tables (first run downloads two small models, ~15 min on CPU)
uv run python scripts/build_artifact.py  # shippable JSON + example outputs + size estimates
uv run pytest                            # tiny fixtures, no network, no model imports
```

## 1. Datasets (verified from primary sources, 2026-10-02)

| Source | Version / format | Licence | Use here |
|---|---|---|---|
| [O*NET Database](https://www.onetcenter.org/database.html) | 31.0 (Aug 2026), 1,016 occupations; text/Excel/CSV/JSON/SQL zip, 13 MB text | CC BY 4.0, attribution required (below) | Backbone. Occupation title, description, core tasks, Knowledge ratings, Software Skills (the "Technology Skills" content; file renamed in v31), Job Titles (the alternate titles, 54k) and Sample of Reported Titles (8k) |
| [NCES CIP 2020 <-> SOC 2018 crosswalk](https://nces.ed.gov/ipeds/cipcode/resources.aspx?y=56) | `CIP2020_SOC2018_Crosswalk.xlsx` (sheet `CIP-SOC`) | US government work, no restrictions stated on the page | Weak labels: academic program -> occupations |
| [BLS Occupational Outlook Handbook](https://www.bls.gov/ooh/about/ooh-developer-info.htm) | 13 MB XML compilation | Public domain, cite BLS (photos excluded) | Not used. Useful later for "typical entry education" and outlook blurbs; keyed by SOC so it joins to O*NET |
| [ESCO](https://esco.ec.europa.eu/en/use-esco) | v1.2.1 (Dec 2025), 28 languages | Search results state CC BY 4.0; the ESCO page I fetched did not state a licence, so **unverified** | Not used. EU taxonomy, no US crosswalk; O*NET is the better fit for LSU |
| [Course-Skill Atlas](https://arxiv.org/html/2404.13163v2) (Figshare 10.6084/m9.figshare.25632429) | 281k rows, per institution x year x field of study | CC BY 4.0 | Not used. Aggregated per field of study (no per-course data), built from Open Syllabus; useful only as a secondary prior on which skills a field teaches |
| [UniSkill](https://arxiv.org/abs/2603.03134) | Manual + synthetic course/skill pairs (ESCO), graduate Systems/Management only | Not found (hosting and licence **unverified**) | Not used. Wrong domain and taxonomy |

No public dataset of (career, course) labels at the course level exists that I could find. The
closest supervision is the CIP-SOC crosswalk, which labels programs (not courses).

**Recommended combination:** O*NET 31.0 (text + titles) + NCES CIP-SOC crosswalk (weak labels), with
a hand-curated LSU-prefix -> CIP map. BLS OOH as an optional later enrichment.

### Required O*NET attribution (must ship wherever O*NET-derived data is shown or bundled)

> This product includes information from the O*NET 31.0 Database by the U.S. Department of Labor,
> Employment and Training Administration (USDOL/ETA), used under the CC BY 4.0 license
> (https://creativecommons.org/licenses/by/4.0/). O*NET(R) is a trademark of USDOL/ETA.
> JevSchedule has modified all or some of this information. USDOL/ETA has not approved, endorsed,
> or tested these modifications.

Model licences: all-MiniLM-L6-v2 is Apache-2.0 (22.7M params, 384-d); bge-small-en-v1.5 is MIT
(33.4M params, 384-d). Both permit redistribution.

## 2. Method

- **Catalog:** 2,752 courses served at `GET /courses`; the prototype uses the 1,782 undergraduate
  courses (levels 1000-4999; the 845 graduate 7000-level courses are excluded, a product choice to
  revisit) and drops `HNRS`. The catalog has only **28 subject prefixes** (no nursing, accounting,
  kinesiology, mechanical engineering, ...). 113 courses lack a description; the title is used.
- **Occupation text:** title + description + 15 core tasks + knowledge areas rated important
  (IM >= 3.5) + up to 15 hot software skills. Embeddings average segment embeddings (description,
  10 tasks, knowledge/tools) because MiniLM truncates at 256 tokens.
- **Weak labels:** `mappings/prefix_cip.json` (hand-curated, 28 prefixes -> CIP 2020 prefixes)
  -> crosswalk -> SOC -> O*NET codes (`code[:7]`). An occupation is relevant to every course in a mapped prefix.
  `NO MATCH` rows and SOC 25-1xxx (postsecondary teachers, which nearly every CIP maps to) are
  dropped. Result: **211 of 1,016 occupations** have at least one mapped prefix.
- **Rankers:** (a) TF-IDF (1-2 grams) and BM25 (own implementation); (b) MiniLM and bge-small cosine
  (bge query instruction on the occupation side only); (c) pairwise logistic regression on
  [z(tfidf), z(bm25), z(minilm), z(bge), course level] fit on (occupation, course) pairs
  (weights: tfidf 0.29, bm25 -0.20, minilm 0.44, bge 0.36, level 0.15). It does not use a
  prefix label as a feature.
- **Free text -> occupation:** index of occupation, alternate and reported titles (63k strings);
  fuzzy (rapidfuzz WRatio), dense (MiniLM) or a 50/50 hybrid, aggregated by max per occupation.
- **Reasons:** top shared salient terms between occupation text and course text (weak, see limitations).

## 3. Results

Evaluation caveat that matters most: labels are **prefix-level**, so they cannot measure ranking
*within* a prefix, and any feature constant within a prefix can look better than it is. Only the
sanity set checks course-level quality, and it is small (15 careers) and was written by the author after
seeing the catalog.

**Weak-label held-out** (211 labelled occupations, 5-fold grouped by SOC minor group e.g. `15-12`,
so near-duplicate neighbours never straddle a split; bootstrap CI over occupations):

| method | P@10 | nDCG@10 | P@10 95% CI |
|---|---|---|---|
| random | 0.084 | 0.083 | 0.069-0.102 |
| largest-prefix prior (MUS first) | 0.028 | 0.028 | 0.009-0.052 |
| TF-IDF | 0.406 | 0.425 | 0.368-0.443 |
| BM25 | 0.338 | 0.342 | 0.302-0.369 |
| MiniLM | 0.492 | 0.503 | 0.451-0.531 |
| bge-small | 0.451 | 0.473 | 0.413-0.491 |
| **blend (learned, headline)** | **0.500** | **0.518** | 0.465-0.549 |
| blend + unsupervised prefix evidence (*) | 0.650 | 0.655 | 0.585-0.706 |

(*) Adds the mean of the top-5 MiniLM similarities within the course's own prefix. No label is used,
but the metric rewards it by construction (labels are per prefix), so treat it as an optimistic
variant, not the headline. Its sanity-set course recall is lower than the plain blend.

**Sanity set** (15 covered careers, end to end through the matcher: top-3 occupations, confidence-weighted):

| method | prefix P@10 | expected-course recall@20 |
|---|---|---|
| TF-IDF | 0.507 | 0.464 |
| BM25 | 0.380 | 0.417 |
| MiniLM | 0.533 | 0.488 |
| bge-small | 0.533 | 0.607 |
| blend (learned) | 0.620 | 0.571 |
| blend + prefix evidence | 0.760 | 0.512 |

With n=15 and a handful of expected courses each, differences between MiniLM, bge and the blend are
within noise; only "dense and blend beat BM25/TF-IDF" is a reasonably safe reading.

**Free text -> occupation** (400 held-out reported titles removed from the index; SOC-level hit):

| matcher | clean top-1 | clean top-5 | typo top-1 | typo top-5 |
|---|---|---|---|---|
| fuzzy | 0.310 | 0.535 | 0.217 | 0.407 |
| dense (MiniLM) | 0.492 | 0.795 | 0.278 | 0.547 |
| hybrid | 0.485 | 0.688 | 0.333 | 0.555 |

On 20 hand-written queries the hybrid put an expected occupation in its top 3 for 19 (the miss:
"ux designer"; ties at WRatio 0.91 make this +/-1 between runs). Gibberish and "I want to be happy"
scored 0.53 / 0.43 versus >= 0.80 for real titles, so a confidence floor around 0.6 works on this
tiny sample. Hybrid was not clearly better than dense on clean input; matching is the weakest part
(top-1 ~ 0.5), so the UI should show the top 3 occupations and let the student pick.

**Catalog coverage / abstention.** `status` per occupation: `covered` (crosswalk routes it to a
catalog prefix; 211), `weak` (no crosswalk route but mean top-10 MiniLM similarity >= 0.50; 89),
`none` (716, abstain). On the sanity set, all three deliberately uncovered careers (pediatric nurse,
accountant, physical therapist) came back `none`, and all 15 covered careers had at least one
`covered` occupation among their top 3. The embedding-only coverage score is a weak signal on its
own (AUC 0.82 labelled vs unlabelled; accountant 0.462 vs psychologist 0.540), so the crosswalk
route is what makes this work.

### Example outputs (top 8; "because" = shared terms)

```
"game developer" -> Software Developers; Video Game Designers; Special Effects Artists and Animators
  CSC 4263 Video Game Design          because: design, project, develop
  CSC 4330 Software Systems Development  because: design, requirements, validation
  CSC 4356 Interactive Computer Graphics  because: computer, systems, data
  THTR 3730 Advanced Post Production     because: analysis          <- noisy
  ART 2554 Graphic Design I; ART 4564 Senior Graphic Design; ART 4514 Experimental Design; ART 2210 Creative Coding
"cybersecurity analyst" -> Information Security Analysts; Digital Forensics Analysts
  ISDS 4096 Cyber Risk Management; ISDS 4123 Computer and Networking Security; ISDS 4125; CSC 2362 Intro to Cybersecurity and Cyber Defense; ISDS 3110; ISDS 4244; CSC 4360 Malware Analysis; CSC 2730
"data scientist at a bank" -> Financial and Investment Analysts; Data Scientists; Bioinformatics Scientists
  CSC 2730 Data Science and Analytics; ISDS 2000/2001 Business Statistics and Analytics I/II; CSC 3730 Machine Learning; CSC 4740 Big Data; ECON 4625 Economic Data Analysis; EXST 3211; EXST 4142
"petroleum geologist" -> Geoscientists; Geological Technicians
  GEOL 4019 Geoarchaeology (noisy); GEOL 4165 Subsurface Geology; GEOL 1601; GEOL 4062 Exploration Geophysics;
"pediatric nurse" -> Registered Nurses [none]  =>  "not covered by the current catalog"
```

## 4. Limitations and bias

- Weak labels come from program-to-occupation tables, not from what employers want from courses; the
  hand map (`mappings/prefix_cip.json`) is a judgement call, and 28 prefixes cover only 211 occupations.
- Prefix-level labels cannot evaluate within-prefix order; the sanity set is small and author-written.
- Exposure bias: the catalog skews to MUS (320), ENGL, THTR, EE, so generic careers drift to arts
  courses (see game developer). Descriptions are short (median < 400 chars) and some are boilerplate.
- O*NET is US-centric, updated quarterly; emerging careers and non-US job titles match poorly.
  Titles also encode gender/seniority conventions of the source survey.
- Reasons are surface-term overlap; for some pairs they are empty or generic. They explain
  similarity, not that the course is *required* for the career.
- Free text matching is ~50% top-1; typos halve dense accuracy.
- Eligibility is out of scope here: nothing in this prototype checks prerequisites, standing or
  catalog year. Rankings must never be shown as "you can take this".

## 5. Recommended integration (privacy-preserving)

README and SECURITY.md say the server holds no user data and the plan stays in local SQLite. So the
career text must never reach the server and no per-user inference should run server-side.

1. **Offline build (CI or by hand), public data only:** run `build_artifact.py` to produce
   `career-courses.json`: per occupation, the top 20 course codes with 2-3 reason terms and a status;
   plus a title index. Measured: **567 kB raw, 118 kB gzipped** for 1,016 occupations (716 have empty
   lists) and 9k titles. Course codes, not copies of descriptions, so it stays valid when the catalog changes (rebuild per catalog year).
2. **On device:** match the typed text to occupations locally. Options and sizes: (i) fuzzy only
   (rapidfuzz-equivalent in TS, e.g. `fuse.js`) over the 9k-title index, adds ~0.3 MB, top-1 0.31 /
   top-5 0.54; (ii) MiniLM in the renderer/main process via ONNX Runtime or transformers.js: int8 model
   **~23 MB** (HF `onnx/model_qint8_*.onnx`; fp32 is 90 MB, bge-small fp32 is 133 MB) plus 3.5 MB of
   int8 title embeddings for 9k titles (24 MB if all 63k alternate titles are embedded), top-1 0.49 /
   top-5 0.80. Recommendation: ship (i) first because it is tiny and deterministic, show the top 3
   occupations to confirm, and add (ii) only if fuzzy proves too weak in practice (it needs a CSP and
   packaging review since the renderer CSP is strict). Fuzzy's typo/ordering robustness is poor, so the
   confirm step matters.
3. **Safety gate:** every suggested course must pass the existing deterministic `isEligible` /
   `validatePlan` checks (US-17, issue #24; T-711 #118) before display; ineligible courses are shown
   as "not yet available (missing prerequisite X)" or hidden, never as recommendations. The model only
   ranks; it never decides eligibility.
4. **Attribution + disclaimer** in the app's About/licences screen and in the README, using the text above.
5. **No telemetry** of the typed career, no network call when matching.

### Proposed follow-up tasks (draft "Done when")

- **T-A: Build and commit the career artifact generator into CI-reproducible form.** Done when
  `build_artifact.py` output is regenerated deterministically from pinned O*NET 31.0 + crosswalk + a
  catalog snapshot, has a size budget test (< 1 MB gz), lists O*NET attribution in the file header,
  and a README section documents how to refresh per catalog year or O*NET release.
- **T-B: Ship the artifact and attribution in the desktop app.** Done when the artifact is bundled as
  a static asset, the About screen shows the O*NET attribution/disclaimer text above, and a test
  asserts the app makes no network request when loading it.
- **T-C: On-device career matcher (fuzzy first).** Done when typing a career in the app returns the
  top 3 occupations with confidence, nonsense input returns "no match", and a unit test (tiny fixture
  index) covers exact, typo, ambiguous and gibberish input without network access.
- **T-D: Career -> courses panel with eligibility gate.** Done when the panel lists courses for the
  selected occupation with the `because:` reason, every row passes `isEligible`/`validatePlan` for the
  student's completed courses and catalog year (ineligible rows show the missing prerequisite), and
  uncovered careers show "not covered by the current catalog" instead of low-confidence results.
- **T-E (optional): Embedding matcher.** Done when a measured top-1 improvement over T-C on a held-out
  set justifies the ~26 MB asset, with packaging and CSP reviewed and the model licence added to the
  third-party notices.
- **T-F (data): Review the prefix -> CIP map and add 20-50 more hand-labelled (career, course)
  judgements** from advisors, to replace the weak labels with real ones for evaluation.
