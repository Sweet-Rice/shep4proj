import { load, type Cheerio, type CheerioAPI } from "cheerio";
import { COURSE_ROW_TEXT } from "./course-list.js";
import { CatalogShapeError } from "./errors.js";

/** One course as described on its catalog detail page. */
export interface CourseDetail {
  /** Course code such as `CSC 1350`. */
  code: string;
  title: string;
  /** Credit text from the catalog, or the documented 3-credit fallback. */
  creditsText: string;
  /** True only when the catalog page omitted credits and the parser assumed 3. */
  creditsAssumed?: true;
  /** Catalog description, without the prerequisite line or notes. */
  description: string;
  /** Text of the `Prereq.:` line, trailing period included; null when absent. */
  prerequisiteText: string | null;
  /**
   * Codes of the courses linked from the prerequisite text, in page order.
   * Empty when there is no prerequisite line.
   */
  prerequisiteCourseCodes: string[];
  /**
   * Every other italic line of the page in document order: enrollment
   * restrictions, contact hours, credit-overlap sentences. A labelled line such
   * as `Coreq.: CSC 1350` is kept as one note, label first.
   */
  notes: string[];
}

/**
 * A child node of the parsed page. cheerio does not re-export the domhandler
 * node types and this package has no direct dependency on domhandler, so the
 * type is read off cheerio's own signature.
 */
type DomNode = CheerioAPI["root"] extends () => Cheerio<infer Root>
  ? Root extends { children: Array<infer Child> }
    ? Child
    : never
  : never;
type DomElement = Extract<DomNode, { tagName: string }>;

/** Label of the italic line that introduces the prerequisite text. */
const PREREQUISITE_LABEL = "Prereq.:";

/** Prefix of the `aria-label` on every course link inside the prerequisite text. */
const COURSE_LINK_LABEL_PREFIX = "View course details for ";

const COURSE_CODE = /^[A-Z]{2,4} \d{4}$/;

/** Sibling elements that end the description block that follows the heading. */
const BLOCK_END_TAGS: Record<string, true> = {
  br: true,
  hr: true,
  div: true,
  table: true,
  h1: true,
  h2: true,
  h3: true,
  h4: true,
  h5: true,
  h6: true,
};

/** Collapses runs of whitespace, `&#160;` included, to one space. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isElement(node: DomNode): node is DomElement {
  return node.type === "tag";
}

/**
 * The catalog puts a `display: none` non-breaking space after every course
 * link, which would otherwise leave a stray space before the punctuation that
 * follows it.
 */
function isHidden(element: DomElement): boolean {
  return /(^|;)\s*display\s*:\s*none/i.test(element.attribs["style"] ?? "");
}

/** Text a reader of the page would see under `node`. */
function visibleText(node: DomNode): string {
  if (node.type === "text") {
    return node.data;
  }
  if (isElement(node) && !isHidden(node)) {
    return node.children.map(visibleText).join("");
  }
  return "";
}

function courseCodesIn($: CheerioAPI, element: DomElement): string[] {
  const anchors = $(element)
    .find(`a[aria-label^='${COURSE_LINK_LABEL_PREFIX}']`)
    .addBack(`a[aria-label^='${COURSE_LINK_LABEL_PREFIX}']`)
    .toArray();
  return anchors.filter(isElement).map((anchor) => {
    const label = anchor.attribs["aria-label"] ?? "";
    const code = collapse(label.slice(COURSE_LINK_LABEL_PREFIX.length));
    if (!COURSE_CODE.test(code)) {
      throw new CatalogShapeError(`prerequisite link label is not a course code: "${label}"`);
    }
    return code;
  });
}

/** Flattens `node` into bare text runs, `<em>` elements, and `<a>` elements, in document order. */
function collectInline(node: DomNode, out: Array<string | DomElement>): void {
  if (node.type === "text") {
    out.push(node.data);
  } else if (isElement(node) && !isHidden(node)) {
    if (node.name === "em" || node.name === "a") {
      out.push(node);
    } else {
      for (const child of node.children) {
        collectInline(child, out);
      }
    }
  }
}

/**
 * Parses a catalog course detail page (`preview_course_nopop.php`).
 *
 * The page has no wrapper around the course body: the title is an
 * `h1#course_preview_title` and everything up to the next block element is
 * flat inline content. Italic (`<em>`) runs carry the prerequisite line and
 * notes, and the bare text between them is the description:
 *
 * - an empty `<em>` is ignored and ends any pending optional label;
 * - an `<em>` ending in `:` is a label and the next non-empty `<em>` (or
 *   unwrapped inline text/anchors for `Prereq.:`) is its value. `Prereq.:`
 *   fills {@link CourseDetail.prerequisiteText} and
 *   {@link CourseDetail.prerequisiteCourseCodes}; any other label becomes a
 *   note reading `<label> <value>`;
 * - every other `<em>` is a note;
 * - text outside the `<em>` runs is the description.
 *
 * Whitespace is collapsed everywhere and non-breaking spaces count as spaces.
 *
 * Pure and network-free. Throws {@link CatalogShapeError} when the heading is
 * missing or malformed, the prerequisite label appears twice, or a
 * prerequisite link's `aria-label` is not a course code, rather than returning
 * a partial course. Empty optional labels are ignored.
 */
export function parseCourseDetail(html: string): CourseDetail {
  const $ = load(html);
  const heading = $("h1#course_preview_title").first();
  const headingNode = heading.get(0);
  if (headingNode === undefined) {
    throw new CatalogShapeError("course detail page has no h1#course_preview_title heading");
  }

  const headingText = collapse(heading.text());
  const match = COURSE_ROW_TEXT.exec(headingText);
  const code = match?.[1]?.toUpperCase();
  const title = match?.[2];
  const headingCreditsText = match?.[3] ?? match?.[4];
  if (code === undefined || title === undefined) {
    throw new CatalogShapeError(
      `course heading does not match "CODE 0000 Title": "${headingText}"`,
    );
  }
  const bodyCreditsText = /(?:credit(?:\s+hours?)?|credits?)\s*:\s*(\d+(?:\s*-\s*\d+)?)/i.exec(
    $("body").text(),
  )?.[1];
  const creditsAssumed = headingCreditsText === undefined && bodyCreditsText === undefined;
  const creditsText =
    headingCreditsText ?? bodyCreditsText ?? "3 Credits not stated in the LSU catalog; assumed 3.";

  const inline: Array<string | DomElement> = [];
  let skippedFirstRule = false;
  for (let node = headingNode.next; node !== null; node = node.next) {
    if (isElement(node)) {
      if (node.name === "hr" && !skippedFirstRule) {
        skippedFirstRule = true;
        continue;
      }
      if (
        BLOCK_END_TAGS[node.name] === true ||
        (node.name === "p" && collapse(visibleText(node)) !== "")
      ) {
        break;
      }
    }
    collectInline(node, inline);
  }

  let prerequisiteText: string | null = null;
  let prerequisiteCourseCodes: string[] = [];
  const notes: string[] = [];
  const descriptionParts: string[] = [];
  let pendingLabel: string | null = null;

  for (let i = 0; i < inline.length; i++) {
    const item = inline[i];
    if (item === undefined) {
      continue;
    }
    if (typeof item === "string") {
      descriptionParts.push(item);
      continue;
    }
    if (item.name !== "em") {
      descriptionParts.push(visibleText(item));
      continue;
    }

    const text = collapse(visibleText(item));
    if (text === "") {
      pendingLabel = null;
      continue;
    }
    if (pendingLabel === null) {
      if (text.endsWith(":")) {
        pendingLabel = text;
        if (pendingLabel === PREREQUISITE_LABEL) {
          if (prerequisiteText !== null) {
            throw new CatalogShapeError(`${code}: more than one "${PREREQUISITE_LABEL}" line`);
          }

          let nextIdx = i + 1;
          while (nextIdx < inline.length) {
            const nextItem = inline[nextIdx];
            if (nextItem === undefined) {
              break;
            }
            if (typeof nextItem === "string" && collapse(nextItem) === "") {
              nextIdx++;
              continue;
            }
            if (
              typeof nextItem !== "string" &&
              nextItem.name === "em" &&
              collapse(visibleText(nextItem)) === ""
            ) {
              nextIdx++;
              continue;
            }
            break;
          }

          const firstItem = inline[nextIdx];
          if (firstItem !== undefined) {
            const startedWithEm = typeof firstItem !== "string" && firstItem.name === "em";
            const prereqParts: string[] = [];
            const prereqElements: DomElement[] = [];
            let prereqRemainder = "";
            let k = nextIdx;
            let endedWithPeriod = false;

            while (k < inline.length) {
              const cur = inline[k];
              if (cur === undefined) {
                break;
              }
              if (typeof cur !== "string" && cur.name === "em") {
                const curText = collapse(visibleText(cur));
                if (curText === "") {
                  k++;
                  continue;
                }
                if (curText.endsWith(":")) {
                  break;
                }
                prereqElements.push(cur);
                const rawText = visibleText(cur);
                prereqParts.push(rawText);
                k++;
                if (curText.endsWith(".")) {
                  endedWithPeriod = true;
                  break;
                }
                continue;
              }

              if (typeof cur !== "string") {
                prereqElements.push(cur);
                const curText = visibleText(cur);
                prereqParts.push(curText);
                k++;
                if (collapse(curText).endsWith(".")) {
                  endedWithPeriod = true;
                  break;
                }
                continue;
              }

              const dotIdx = cur.indexOf(".");
              if (dotIdx !== -1) {
                prereqParts.push(cur.slice(0, dotIdx + 1));
                prereqRemainder = cur.slice(dotIdx + 1);
                endedWithPeriod = true;
                k++;
                break;
              }
              prereqParts.push(cur);
              k++;
            }

            const candidateText = collapse(prereqParts.join(""));
            const candidateCodes = prereqElements.flatMap((el) => courseCodesIn($, el));
            const hasRemainingDescription =
              collapse(prereqRemainder) !== "" ||
              inline
                .slice(k)
                .some((it) =>
                  typeof it === "string" ? collapse(it) !== "" : collapse(visibleText(it)) !== "",
                );

            const nextAfterPrereq = inline[k];
            const isValidPrereq =
              candidateText !== "" &&
              (startedWithEm ||
                candidateCodes.length > 0 ||
                (endedWithPeriod && hasRemainingDescription) ||
                (nextAfterPrereq !== undefined &&
                  typeof nextAfterPrereq !== "string" &&
                  nextAfterPrereq.name === "em"));

            if (isValidPrereq) {
              prerequisiteText = candidateText;
              prerequisiteCourseCodes = candidateCodes;
              pendingLabel = null;
              if (prereqRemainder !== "") {
                descriptionParts.push(prereqRemainder);
              }
              i = k - 1;
              continue;
            }
          }
        }
      } else {
        notes.push(text);
      }
    } else {
      notes.push(`${pendingLabel} ${text}`);
      pendingLabel = null;
    }
  }

  // Labels are optional; a label with no value does not make the course unusable.
  let description = collapse(descriptionParts.join(""));
  if (description !== "") {
    const seeIndex = notes.findIndex((n) => /^See$/i.test(n));
    if (seeIndex !== -1) {
      notes.splice(seeIndex, 1);
      description = collapse("See " + description);
    }
  } else if (notes.length > 0) {
    const seeIndex = notes.findIndex((n) => /^See /i.test(n));
    if (seeIndex !== -1) {
      description = notes.splice(seeIndex, 1)[0]!;
    } else {
      description = notes.join(" ");
    }
  }
  // Catalog graduate research/thesis courses may legitimately have no description.

  return {
    code,
    title,
    creditsText,
    description,
    ...(creditsAssumed ? { creditsAssumed: true as const } : {}),
    prerequisiteText,
    prerequisiteCourseCodes,
    notes,
  };
}
