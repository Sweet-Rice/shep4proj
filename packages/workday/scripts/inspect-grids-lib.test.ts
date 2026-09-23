import { describe, expect, it } from "vitest";

import type { Har } from "../src/redact/har-types.ts";
import {
  columnLabelPairs,
  formatEntry,
  gridRowCount,
  inspectHar,
  isHar,
  isInterestingPath,
  isJsonContentType,
  redactedPathOnly,
} from "./inspect-grids-lib.ts";

function buildHar(entries: Har["log"]["entries"]): Har {
  return { log: { entries } };
}

const VIEW_MY_COURSES_BODY = {
  title: "View My Courses",
  body: {
    widget: "panel",
    label: "Current Courses",
    sections: {
      widget: "panelList",
      title: "Fall 2026",
      grid: {
        widget: "grid",
        label: "Registered Courses",
        columns: [
          { columnId: "10.1", label: "Course" },
          { columnId: "10.2", label: "Section" },
        ],
        rows: [
          {
            rowIndex: 0,
            cellsMap: {
              "10.1": { instances: [{ text: "SUPER SECRET STUDENT NAME - CSC 4103" }] },
              "10.2": { text: "001" },
            },
          },
          {
            rowIndex: 1,
            cellsMap: {
              "10.1": { instances: [{ text: "ANOTHER NAME - MATH 4997" }] },
              "10.2": { text: "002" },
            },
          },
        ],
        // Duplicate decoy rows that must never be traversed.
        maxLengthValueRow: {
          widget: "grid",
          label: "Decoy",
          rows: [{ rowIndex: 0, cellsMap: { "10.1": { text: "SHOULD NEVER APPEAR" } } }],
        },
        maxWordLengthValueRow: {
          widget: "grid",
          label: "AnotherDecoy",
          rows: [],
        },
      },
    },
  },
};

function buildEntry(overrides: Partial<Har["log"]["entries"][number]> = {}) {
  return {
    request: {
      method: "GET",
      url: "https://www.myworkday.com/lsu/generic-hub/task/9988771122334455.htmld?clientRequestID=abcdef1234567890",
    },
    response: {
      status: 200,
      headers: [{ name: "Content-Type", value: "application/json" }],
      content: { mimeType: "application/json", text: JSON.stringify(VIEW_MY_COURSES_BODY) },
    },
    ...overrides,
  };
}

describe("isInterestingPath", () => {
  it("matches generic-hub paths", () => {
    expect(isInterestingPath("/lsu/generic-hub/task/2998$30300.htmld")).toBe(true);
  });
  it("matches any .htmld path", () => {
    expect(isInterestingPath("/lsu/d/task/2998$30300.htmld")).toBe(true);
  });
  it("does not match unrelated paths", () => {
    expect(isInterestingPath("/lsu/static/app.js")).toBe(false);
  });
});

describe("isJsonContentType", () => {
  it("detects JSON via mimeType", () => {
    expect(isJsonContentType(buildEntry())).toBe(true);
  });
  it("rejects html", () => {
    expect(
      isJsonContentType(
        buildEntry({
          response: {
            status: 200,
            headers: [],
            content: { mimeType: "text/html", text: "<html></html>" },
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("redactedPathOnly", () => {
  it("strips the query string and redacts token-like path segments", () => {
    const path = redactedPathOnly(
      "https://www.myworkday.com/lsu/generic-hub/task/9988771122334455.htmld?clientRequestID=abcdef1234567890",
    );
    // The id segment and its ".htmld" suffix form a single path segment
    // that isIdOrTokenSegment (mostly-digit, length >= 8) redacts whole.
    expect(path).toBe("/lsu/generic-hub/task/TOKEN");
    expect(path).not.toContain("clientRequestID");
    expect(path).not.toContain("9988771122334455");
  });
});

describe("isHar", () => {
  it("accepts a well-formed HAR", () => {
    expect(isHar(buildHar([]))).toBe(true);
  });
  it("rejects malformed input", () => {
    expect(isHar({ nope: true })).toBe(false);
    expect(isHar(null)).toBe(false);
  });
});

describe("gridRowCount / columnLabelPairs", () => {
  const grid = VIEW_MY_COURSES_BODY.body.sections.grid as unknown as Record<string, unknown>;

  it("counts rows from the rows array when rowCount is absent", () => {
    expect(gridRowCount(grid)).toBe(2);
  });

  it("prefers an explicit rowCount field", () => {
    expect(gridRowCount({ ...grid, rowCount: 40 })).toBe(40);
  });

  it("lists columnId=label pairs from column definitions, falling back to row cell labels", () => {
    const pairs = columnLabelPairs(grid);
    expect(pairs).toContain("10.1=Course");
    expect(pairs).toContain("10.2=Section");
  });
});

describe("formatEntry / inspectHar", () => {
  it("finds the nested grid, skips maxLength* decoys, and never prints a cell value or instance text", () => {
    const lines = formatEntry(buildEntry());
    const joined = lines.join("\n");

    expect(joined).toContain('grid: label="Registered Courses" rowCount=2');
    expect(joined).toContain("columns: 10.1=Course, 10.2=Section");
    expect(joined).toContain('panel label="Current Courses"');
    expect(joined).toContain('panelList title="Fall 2026"');

    // The decoy grids nested under maxLengthValueRow/maxWordLengthValueRow
    // must never surface.
    expect(joined).not.toContain("Decoy");
    expect(joined).not.toContain("AnotherDecoy");

    // No cell values, instance text, or names anywhere in the output.
    expect(joined).not.toContain("SUPER SECRET STUDENT NAME");
    expect(joined).not.toContain("ANOTHER NAME");
    expect(joined).not.toContain("CSC 4103");
    expect(joined).not.toContain("MATH 4997");
    expect(joined).not.toContain("001");
    expect(joined).not.toContain("002");
  });

  it("prints the top-level title when present", () => {
    const lines = formatEntry(buildEntry());
    expect(lines).toContain("  title: View My Courses");
  });

  it("redacts the URL and strips the query string in the printed header line", () => {
    const lines = formatEntry(buildEntry());
    expect(lines[0]).toBe("GET /lsu/generic-hub/task/TOKEN");
  });

  it("returns [] for a non-matching URL", () => {
    const lines = formatEntry(
      buildEntry({
        request: { method: "GET", url: "https://www.myworkday.com/lsu/static/app.js" },
      }),
    );
    expect(lines).toEqual([]);
  });

  it("returns [] for a matching URL that isn't JSON", () => {
    const lines = formatEntry(
      buildEntry({
        response: {
          status: 200,
          headers: [],
          content: { mimeType: "text/html", text: "<html></html>" },
        },
      }),
    );
    expect(lines).toEqual([]);
  });

  it("inspectHar filters a whole HAR down to matching entries and counts them", () => {
    const har = buildHar([
      {
        request: { method: "GET", url: "https://www.myworkday.com/lsu/static/app.js" },
        response: {
          status: 200,
          headers: [],
          content: { mimeType: "text/javascript", text: "//js" },
        },
      },
      buildEntry(),
    ]);
    const { lines, matchedCount } = inspectHar(har);
    expect(matchedCount).toBe(1);
    expect(lines.join("\n")).toContain("Registered Courses");
  });
});
