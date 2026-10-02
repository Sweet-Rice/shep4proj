import { describe, expect, it } from "vitest";
import type { Db } from "../db/client.js";
import { runCatalogScrapeCommand } from "./catalog-scrape-command.js";

function makeDependencies(
  result = {
    scraped: ["CSC"],
    skipped: [] as string[],
    failed: [] as { code: string; error: string }[],
  },
) {
  const calls: string[] = [];
  const messages: string[] = [];
  const dependencies = {
    createDb(databaseUrl: string) {
      calls.push(`db:${databaseUrl}`);
      return { db: {} as Db, close: async () => void calls.push("close-db") };
    },
    createCatalogFetcher() {
      return { fetchHtml: async () => "", close: async () => {} };
    },
    runScheduledCatalogScrape: async () => result,
    log: (message: string) => messages.push(message),
    error: (message: string) => messages.push(message),
  };
  return { dependencies, calls, messages };
}

describe("catalog scrape command", () => {
  it("reports a missing DATABASE_URL without creating resources", async () => {
    const { dependencies, calls, messages } = makeDependencies();

    const exitCode = await runCatalogScrapeCommand(undefined, dependencies);

    expect(exitCode).toBe(1);
    expect(messages).toContain("DATABASE_URL is not set (see .env.example)");
    expect(calls).toEqual([]);
  });
  it("returns success when every department scrape succeeds", async () => {
    const { dependencies, messages } = makeDependencies({
      scraped: ["CSC", "MATH"],
      skipped: ["ENGL"],
      failed: [],
    });

    const exitCode = await runCatalogScrapeCommand("postgres://test", dependencies);

    expect(exitCode).toBe(0);
    expect(messages).toContain("2 departments scraped; 1 skipped");
  });

  it("reports failures and returns a failing status", async () => {
    const { dependencies, calls, messages } = makeDependencies({
      scraped: ["CSC"],
      skipped: ["MATH"],
      failed: [{ code: "CSC 1350", error: "fixture failure" }],
    });

    const exitCode = await runCatalogScrapeCommand("postgres://test", dependencies);

    expect(exitCode).toBe(1);
    expect(messages).toContain("1 departments scraped; 1 skipped");
    expect(messages).toContain("CSC 1350: failed: fixture failure");
    expect(calls).toEqual(["db:postgres://test", "close-db"]);
  });

  it("closes the database even when the scrape rejects", async () => {
    const { dependencies, calls } = makeDependencies();
    dependencies.runScheduledCatalogScrape = async () => {
      throw new Error("fixture scrape failure");
    };

    await expect(runCatalogScrapeCommand("postgres://test", dependencies)).rejects.toThrow(
      "fixture scrape failure",
    );
    expect(calls).toEqual(["db:postgres://test", "close-db"]);
  });
});
