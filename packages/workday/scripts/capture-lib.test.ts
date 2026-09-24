import { describe, expect, it } from "vitest";

import {
  ACADEMIC_RECORD_TASK_ID,
  WORKDAY_HAR_URL_FILTER,
  classifyResponse,
  extractGridSummaries,
  isAcademicRecordGrid,
  isCurrentRegistrationsGrid,
  isWorkdayHost,
  jsonTopLevelKeys,
  pickLikelyAcademicRecordEntry,
  pickLikelyRegistrationsEntry,
  type RecordCandidate,
} from "./capture-lib.ts";

describe("isWorkdayHost", () => {
  it("matches the bare apex host", () => {
    expect(isWorkdayHost("myworkday.com")).toBe(true);
  });

  it("matches subdomains", () => {
    expect(isWorkdayHost("www.myworkday.com")).toBe(true);
    expect(isWorkdayHost("wd5.myworkday.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isWorkdayHost("WWW.MyWorkday.COM")).toBe(true);
  });

  it("rejects lookalike hosts", () => {
    expect(isWorkdayHost("evilmyworkday.com")).toBe(false);
    expect(isWorkdayHost("myworkday.com.evil.example")).toBe(false);
    expect(isWorkdayHost("notmyworkday.com")).toBe(false);
  });

  it("rejects unrelated hosts", () => {
    expect(isWorkdayHost("example.com")).toBe(false);
    expect(isWorkdayHost("")).toBe(false);
  });
});

describe("WORKDAY_HAR_URL_FILTER", () => {
  const cases: Array<[string, boolean]> = [
    ["https://www.myworkday.com/lsu/d/task/2998$30300.htmld", true],
    ["https://wd5-impl.myworkday.com/api/foo", true],
    ["https://myworkday.com/", true],
    ["https://evilmyworkday.com/phish", false],
    ["https://myworkday.com.evil.example/", false],
    ["https://cdn.example.com/analytics.js", false],
    ["http://www.myworkday.com/insecure", false],
  ];

  it.each(cases)("%s -> %s", (url, expected) => {
    expect(WORKDAY_HAR_URL_FILTER.test(url)).toBe(expected);
  });

  it("agrees with isWorkdayHost on every case", () => {
    for (const [url] of cases) {
      const hostname = new URL(url).hostname;
      const bySameHostRule = url.startsWith("https://") && isWorkdayHost(hostname);
      expect(WORKDAY_HAR_URL_FILTER.test(url)).toBe(bySameHostRule);
    }
  });
});

describe("classifyResponse", () => {
  it("classifies a JSON object body as json", () => {
    expect(classifyResponse('{"a":1,"b":[1,2,3]}')).toBe("json");
  });

  it("classifies a JSON array body as json", () => {
    expect(classifyResponse("[1,2,3]")).toBe("json");
  });

  it("ignores mimeType and classifies by content alone", () => {
    // Workday sometimes mislabels; we never trust the header, only the body.
    expect(classifyResponse('{"ok":true}')).toBe("json");
  });

  it("classifies an HTML document as html", () => {
    expect(classifyResponse("<!DOCTYPE html><html><body>hi</body></html>")).toBe("html");
    expect(classifyResponse("  <html><head></head></html>")).toBe("html");
  });

  it("classifies plain text as other", () => {
    expect(classifyResponse("just some text")).toBe("other");
  });

  it("classifies empty/missing bodies as other", () => {
    expect(classifyResponse("")).toBe("other");
    expect(classifyResponse(null)).toBe("other");
    expect(classifyResponse(undefined)).toBe("other");
  });
});

describe("jsonTopLevelKeys", () => {
  it("returns object keys, never values", () => {
    const keys = jsonTopLevelKeys('{"studentId":"12345","name":"Real Name","terms":[]}');
    expect(keys).toEqual(["studentId", "name", "terms"]);
  });

  it("returns an array marker for top-level arrays", () => {
    expect(jsonTopLevelKeys("[1,2,3,4]")).toEqual(["array(4)"]);
  });

  it("returns an empty list for scalars", () => {
    expect(jsonTopLevelKeys("42")).toEqual([]);
    expect(jsonTopLevelKeys("null")).toEqual([]);
  });

  it("returns null for non-JSON", () => {
    expect(jsonTopLevelKeys("<html></html>")).toBeNull();
  });
});

const academicRecordBody = JSON.stringify({
  body: {
    widget: "grid",
    label: "Enrollments",
    columns: [{ columnId: "90.2", label: "Course" }],
    rows: [],
  },
});

const currentRegistrationsBody = JSON.stringify({
  body: {
    widget: "grid",
    label: "My Enrolled Courses",
    columns: [
      { columnId: "262.2", label: "Course Listing" },
      { columnId: "256.2", label: "Registration Status" },
    ],
    rows: [],
  },
});

describe("extractGridSummaries", () => {
  it("returns [] for a non-JSON body", () => {
    expect(extractGridSummaries("<html></html>")).toEqual([]);
  });

  it("returns [] for null / a JSON body with no body key", () => {
    expect(extractGridSummaries(null)).toEqual([]);
    expect(extractGridSummaries(JSON.stringify({ title: "no body" }))).toEqual([]);
  });

  it("extracts a grid's label and column labels, never row/cell content", () => {
    const summaries = extractGridSummaries(academicRecordBody);
    expect(summaries).toEqual([{ label: "Enrollments", columnLabels: ["Course"] }]);
  });
});

describe("isAcademicRecordGrid / isCurrentRegistrationsGrid", () => {
  it("classifies the Enrollments grid as the academic record, not registrations", () => {
    const [summary] = extractGridSummaries(academicRecordBody);
    expect(isAcademicRecordGrid(summary!)).toBe(true);
    expect(isCurrentRegistrationsGrid(summary!)).toBe(false);
  });

  it("classifies the My Enrolled Courses grid as registrations, not the academic record", () => {
    const [summary] = extractGridSummaries(currentRegistrationsBody);
    expect(isCurrentRegistrationsGrid(summary!)).toBe(true);
    expect(isAcademicRecordGrid(summary!)).toBe(false);
  });
});

describe("pickLikelyAcademicRecordEntry / pickLikelyRegistrationsEntry", () => {
  function candidate(overrides: Partial<RecordCandidate>): RecordCandidate {
    return {
      urlPath: "/api/other",
      classification: "other",
      bytes: 0,
      afterNavigation: false,
      bodyText: null,
      ...overrides,
    };
  }

  it("never picks an HTML shell, even one whose URL names the right task id", () => {
    const entries = [
      candidate({
        urlPath: `/lsu/d/task/${ACADEMIC_RECORD_TASK_ID}.htmld`,
        classification: "html",
        bytes: 33000,
        afterNavigation: true,
        bodyText: "<!DOCTYPE html><html></html>",
      }),
      candidate({
        urlPath: "/lsu/generic-hub/page-context-id/c0.htmld",
        classification: "json",
        bytes: 5000,
        afterNavigation: true,
        bodyText: academicRecordBody,
      }),
    ];
    const picked = pickLikelyAcademicRecordEntry(entries);
    expect(picked?.classification).toBe("json");
    expect(picked?.urlPath).toBe("/lsu/generic-hub/page-context-id/c0.htmld");
  });

  it("picks the largest JSON response that actually contains a matching grid", () => {
    const entries = [
      candidate({
        urlPath: "/api/unrelated-big",
        classification: "json",
        bytes: 999999,
        afterNavigation: true,
        bodyText: JSON.stringify({ body: { widget: "container", children: [] } }),
      }),
      candidate({
        urlPath: "/lsu/generic-hub/page-context-id/c0.htmld",
        classification: "json",
        bytes: 5000,
        afterNavigation: true,
        bodyText: academicRecordBody,
      }),
    ];
    const picked = pickLikelyAcademicRecordEntry(entries);
    expect(picked?.urlPath).toBe("/lsu/generic-hub/page-context-id/c0.htmld");
  });

  it("names the academic record and the registrations entries separately", () => {
    const entries = [
      candidate({
        urlPath: "/lsu/generic-hub/page-context-id/c0.htmld",
        classification: "json",
        bytes: 5000,
        afterNavigation: true,
        bodyText: academicRecordBody,
      }),
      candidate({
        urlPath: "/lsu/generic-hub/page-context-id/c4.htmld",
        classification: "json",
        bytes: 3000,
        afterNavigation: true,
        bodyText: currentRegistrationsBody,
      }),
    ];

    expect(pickLikelyAcademicRecordEntry(entries)?.urlPath).toBe(
      "/lsu/generic-hub/page-context-id/c0.htmld",
    );
    expect(pickLikelyRegistrationsEntry(entries)?.urlPath).toBe(
      "/lsu/generic-hub/page-context-id/c4.htmld",
    );
  });

  it("returns undefined when nothing contains a matching grid", () => {
    const entries = [
      candidate({
        urlPath: "/api/pre-nav",
        classification: "json",
        bytes: 100,
        afterNavigation: false,
        bodyText: JSON.stringify({ body: { widget: "container", children: [] } }),
      }),
      candidate({
        urlPath: "/api/html",
        classification: "html",
        bytes: 100,
        afterNavigation: true,
        bodyText: "<html></html>",
      }),
    ];
    expect(pickLikelyAcademicRecordEntry(entries)).toBeUndefined();
    expect(pickLikelyRegistrationsEntry(entries)).toBeUndefined();
  });
});
