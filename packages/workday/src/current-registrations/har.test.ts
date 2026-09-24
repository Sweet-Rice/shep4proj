import { describe, expect, it } from "vitest";
import type { Har } from "../redact/har-types.ts";
import { extractCurrentRegistrationsFromHar } from "./har.ts";
import { parseCurrentRegistrations } from "./parse.ts";
import { WorkdayShapeError } from "./types.ts";

const enrolledGridBody = {
  body: {
    widget: "grid",
    label: "My Enrolled Courses",
    columns: [
      { columnId: "262.2", label: "Course Listing" },
      { columnId: "256.2", label: "Registration Status" },
    ],
    rows: [
      {
        rowIndex: 0,
        cellsMap: {
          "262.2": { instances: [{ text: "CSC 1350 - Data Structures" }] },
          "256.2": { instances: [{ text: "Registered" }] },
        },
      },
    ],
  },
};

const hubNavBody = {
  body: { widget: "container", children: [] },
};

function buildHar(entries: Har["log"]["entries"]): Har {
  return { log: { entries } };
}

describe("extractCurrentRegistrationsFromHar", () => {
  it("finds a matching entry under a page-context-id URL (the context id varies per session)", () => {
    const har = buildHar([
      {
        request: {
          method: "GET",
          url: "https://www.myworkday.com/lsu/task/2998$28771.htmld",
        },
        response: {
          status: 200,
          headers: [{ name: "Content-Type", value: "application/json" }],
          content: { mimeType: "application/json", text: JSON.stringify(hubNavBody) },
        },
      },
      {
        request: {
          method: "GET",
          url: "https://www.myworkday.com/lsu/generic-hub/page-context-id/c4.htmld",
        },
        response: {
          status: 200,
          headers: [{ name: "Content-Type", value: "application/json" }],
          content: { mimeType: "application/json", text: JSON.stringify(enrolledGridBody) },
        },
      },
    ]);

    const json = extractCurrentRegistrationsFromHar(har);
    const result = parseCurrentRegistrations(json);
    expect(result.enrolled).toHaveLength(1);
    expect(result.enrolled[0]?.code).toBe("CSC 1350");
  });

  it("finds a matching entry under the generic-hub/task/2998$28771 URL form too", () => {
    const har = buildHar([
      {
        request: {
          method: "GET",
          url: "https://www.myworkday.com/lsu/generic-hub/task/2998$28771.htmld?clientRequestID=fake-uuid",
        },
        response: {
          status: 200,
          headers: [{ name: "Content-Type", value: "application/json" }],
          content: { mimeType: "application/json", text: JSON.stringify(enrolledGridBody) },
        },
      },
    ]);

    const json = extractCurrentRegistrationsFromHar(har);
    const result = parseCurrentRegistrations(json);
    expect(result.enrolled).toHaveLength(1);
  });

  it("doesn't rely on the URL context id - a hub-nav response under /generic-hub/ with no matching grid is skipped", () => {
    const har = buildHar([
      {
        request: {
          method: "GET",
          url: "https://www.myworkday.com/lsu/generic-hub/page-context-id/c0.htmld",
        },
        response: {
          status: 200,
          headers: [{ name: "Content-Type", value: "application/json" }],
          content: { mimeType: "application/json", text: JSON.stringify(hubNavBody) },
        },
      },
      {
        request: {
          method: "GET",
          url: "https://www.myworkday.com/lsu/generic-hub/page-context-id/c4.htmld",
        },
        response: {
          status: 200,
          headers: [{ name: "Content-Type", value: "application/json" }],
          content: { mimeType: "application/json", text: JSON.stringify(enrolledGridBody) },
        },
      },
    ]);

    const json = extractCurrentRegistrationsFromHar(har);
    expect(json).toEqual(enrolledGridBody);
  });

  it("throws WorkdayShapeError when no entry matches", () => {
    const har = buildHar([
      {
        request: {
          method: "GET",
          url: "https://www.myworkday.com/lsu/generic-hub/page-context-id/c0.htmld",
        },
        response: {
          status: 200,
          headers: [{ name: "Content-Type", value: "application/json" }],
          content: { mimeType: "application/json", text: JSON.stringify(hubNavBody) },
        },
      },
    ]);

    expect(() => extractCurrentRegistrationsFromHar(har)).toThrow(WorkdayShapeError);
  });

  it("throws WorkdayShapeError when the HAR is malformed", () => {
    expect(() => extractCurrentRegistrationsFromHar({})).toThrow(WorkdayShapeError);
  });
});
