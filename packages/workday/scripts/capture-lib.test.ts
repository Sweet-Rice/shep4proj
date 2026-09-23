import { describe, expect, it } from "vitest";

import {
  ACADEMIC_RECORD_TASK_ID,
  WORKDAY_HAR_URL_FILTER,
  classifyResponse,
  isWorkdayHost,
  jsonTopLevelKeys,
  pickLikelyRecordEntry,
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

describe("pickLikelyRecordEntry", () => {
  function candidate(overrides: Partial<RecordCandidate>): RecordCandidate {
    return {
      urlPath: "/api/other",
      classification: "other",
      bytes: 0,
      afterNavigation: false,
      ...overrides,
    };
  }

  it("prefers an entry whose path names the academic-record task id", () => {
    const entries = [
      candidate({
        urlPath: "/api/big",
        classification: "json",
        bytes: 999999,
        afterNavigation: true,
      }),
      candidate({
        urlPath: `/lsu/d/task/${ACADEMIC_RECORD_TASK_ID}.htmld`,
        classification: "html",
        bytes: 10,
        afterNavigation: false,
      }),
    ];
    const picked = pickLikelyRecordEntry(entries);
    expect(picked?.urlPath).toContain(ACADEMIC_RECORD_TASK_ID);
  });

  it("falls back to the largest post-navigation JSON response", () => {
    const entries = [
      candidate({
        urlPath: "/api/small",
        classification: "json",
        bytes: 100,
        afterNavigation: true,
      }),
      candidate({
        urlPath: "/api/pre-nav-big",
        classification: "json",
        bytes: 99999,
        afterNavigation: false,
      }),
      candidate({
        urlPath: "/api/big",
        classification: "json",
        bytes: 5000,
        afterNavigation: true,
      }),
      candidate({
        urlPath: "/api/html",
        classification: "html",
        bytes: 100000,
        afterNavigation: true,
      }),
    ];
    const picked = pickLikelyRecordEntry(entries);
    expect(picked?.urlPath).toBe("/api/big");
  });

  it("returns undefined when nothing matches either heuristic", () => {
    const entries = [
      candidate({
        urlPath: "/api/pre-nav",
        classification: "json",
        bytes: 100,
        afterNavigation: false,
      }),
      candidate({
        urlPath: "/api/html",
        classification: "html",
        bytes: 100,
        afterNavigation: true,
      }),
    ];
    expect(pickLikelyRecordEntry(entries)).toBeUndefined();
  });
});
