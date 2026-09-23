import { describe, expect, it } from "vitest";
import type { Har } from "../redact/har-types.ts";
import { extractFromHar } from "./har.ts";
import { parseAcademicRecord } from "./parse.ts";
import { WorkdayShapeError } from "./types.ts";

function buildSyntheticHar(overrides?: Partial<Har["log"]["entries"][number]>): Har {
  const academicRecordBody = {
    body: {
      widget: "grid",
      label: "Enrollments",
      columns: [{ columnId: "90.2", label: "Course" }],
      rows: [
        {
          rowIndex: 0,
          cellsMap: {
            "90.2": { instances: [{ text: "CSC 1350 - Data Structures" }] },
          },
        },
      ],
    },
  };

  return {
    log: {
      entries: [
        {
          request: {
            method: "GET",
            url: "https://www.myworkday.com/lsu/other-endpoint.htmld",
          },
          response: {
            status: 200,
            headers: [{ name: "Content-Type", value: "text/html" }],
            content: { mimeType: "text/html", text: "<html></html>" },
          },
        },
        {
          request: {
            method: "GET",
            url: "https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld?clientRequestID=fake-uuid",
          },
          response: {
            status: 200,
            headers: [{ name: "Content-Type", value: "application/json" }],
            content: { mimeType: "application/json", text: JSON.stringify(academicRecordBody) },
          },
          ...overrides,
        },
      ],
    },
  };
}

describe("extractFromHar", () => {
  it("finds the academic-record entry by URL and content type, and parses its body", () => {
    const har = buildSyntheticHar();
    const json = extractFromHar(har);
    const result = parseAcademicRecord(json);

    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]?.code).toBe("CSC 1350");
  });

  it("also matches the page-context-id URL form", () => {
    const har = buildSyntheticHar();
    har.log.entries[1]!.request.url =
      "https://www.myworkday.com/lsu/generic-hub/page-context-id/abc123.htmld";

    const json = extractFromHar(har);
    expect(() => parseAcademicRecord(json)).not.toThrow();
  });

  it("throws WorkdayShapeError when no matching entry exists", () => {
    const har: Har = { log: { entries: [] } };
    expect(() => extractFromHar(har)).toThrow(WorkdayShapeError);
  });

  it("throws WorkdayShapeError when the HAR itself is malformed", () => {
    expect(() => extractFromHar({ nope: true })).toThrow(WorkdayShapeError);
  });
});
