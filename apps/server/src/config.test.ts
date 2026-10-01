import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  readListenConfig,
  readSeatPollConfig,
  readSectionScrapeConfig,
} from "./config.js";

const HOUR = 60 * 60 * 1000;

describe("readListenConfig", () => {
  it("defaults to localhost:3000", () => {
    expect(readListenConfig({})).toEqual({ host: DEFAULT_HOST, port: DEFAULT_PORT });
    expect(DEFAULT_HOST).toBe("127.0.0.1");
  });

  it("treats blank values as unset", () => {
    expect(readListenConfig({ HOST: " ", PORT: "" })).toEqual({
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
    });
  });

  it("reads HOST and PORT", () => {
    expect(readListenConfig({ HOST: "0.0.0.0", PORT: "8080" })).toEqual({
      host: "0.0.0.0",
      port: 8080,
    });
  });

  it("allows port 0 (pick a free port)", () => {
    expect(readListenConfig({ PORT: "0" }).port).toBe(0);
  });

  it.each(["abc", "80.5", "-1", "65536", "3000abc"])("rejects PORT=%s", (port) => {
    expect(() => readListenConfig({ PORT: port })).toThrow(/PORT must be an integer/);
  });
});

describe("readSectionScrapeConfig", () => {
  it("is off for CSC by default", () => {
    expect(readSectionScrapeConfig({})).toEqual({ enabled: false, departments: ["CSC"] });
    expect(readSectionScrapeConfig({ SECTION_SCRAPE_ENABLED: " " }).enabled).toBe(false);
  });

  it("reads the flag and a department list", () => {
    expect(
      readSectionScrapeConfig({
        SECTION_SCRAPE_ENABLED: "true",
        SECTION_SCRAPE_DEPARTMENTS: "CSC, MATH,CSC",
      }),
    ).toEqual({ enabled: true, departments: ["CSC", "MATH"] });
  });

  it.each(["yes", "1", "TRUE", "on"])("rejects SECTION_SCRAPE_ENABLED=%s", (value) => {
    expect(() => readSectionScrapeConfig({ SECTION_SCRAPE_ENABLED: value })).toThrow(
      /SECTION_SCRAPE_ENABLED must be/,
    );
  });

  it.each(["csc", "CSC,", "C", "CSC%", "CSC MATH"])(
    "rejects SECTION_SCRAPE_DEPARTMENTS=%j",
    (value) => {
      expect(() => readSectionScrapeConfig({ SECTION_SCRAPE_DEPARTMENTS: value })).toThrow(
        /SECTION_SCRAPE_DEPARTMENTS must be/,
      );
    },
  );
});

describe("readSeatPollConfig", () => {
  it("is off and daily by default", () => {
    expect(readSeatPollConfig({})).toEqual({ enabled: false, intervalMs: 24 * HOUR });
    expect(readSeatPollConfig({ SEAT_POLL_ENABLED: " ", SEAT_POLL_INTERVAL_MINUTES: "" })).toEqual({
      enabled: false,
      intervalMs: 24 * HOUR,
    });
  });

  it("reads the flag and an interval in minutes", () => {
    expect(
      readSeatPollConfig({ SEAT_POLL_ENABLED: "true", SEAT_POLL_INTERVAL_MINUTES: "60" }),
    ).toEqual({ enabled: true, intervalMs: HOUR });
  });

  it.each(["yes", "1", "TRUE"])("rejects SEAT_POLL_ENABLED=%s", (value) => {
    expect(() => readSeatPollConfig({ SEAT_POLL_ENABLED: value })).toThrow(
      /SEAT_POLL_ENABLED must be/,
    );
  });

  it.each(["59", "0", "-60", "90.5", "1h", "35001"])(
    "rejects SEAT_POLL_INTERVAL_MINUTES=%s",
    (value) => {
      expect(() => readSeatPollConfig({ SEAT_POLL_INTERVAL_MINUTES: value })).toThrow(
        /SEAT_POLL_INTERVAL_MINUTES must be/,
      );
    },
  );
});
