import { describe, expect, it } from "vitest";
import type { Db } from "../db/client.js";
import { runCatalogScrapeCommand } from "./catalog-scrape-command.js";

function makeDependencies(
  result = { listed: 1, upserted: 1, failed: [] as { code: string; error: string }[] },
) {
  const calls: string[] = [];
  const messages: string[] = [];
  const dependencies = {
    createDb(databaseUrl: string) {
      calls.push(`db:${databaseUrl}`);
      return { db: {} as Db, close: async () => void calls.push("close-db") };
    },
    createCatalogFetcher() {
      return { fetchHtml: async () => "", close: async () => void calls.push("close-fetcher") };
    },
    runCatalogScrape: async () => result,
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

  it("reports failures, returns a failing status, and closes both resources", async () => {
    const { dependencies, calls, messages } = makeDependencies({
      listed: 1,
      upserted: 0,
      failed: [{ code: "CSC 1350", error: "fixture failure" }],
    });

    const exitCode = await runCatalogScrapeCommand("postgres://test", dependencies);

    expect(exitCode).toBe(1);
    expect(messages).toContain("1 courses listed; 0 courses stored/upserted");
    expect(messages).toContain("CSC 1350: failed: fixture failure");
    expect(calls).toEqual(["db:postgres://test", "close-fetcher", "close-db"]);
  });

  it("closes the database even when the scrape rejects", async () => {
    const { dependencies, calls } = makeDependencies();
    dependencies.runCatalogScrape = async () => {
      throw new Error("fixture scrape failure");
    };

    await expect(runCatalogScrapeCommand("postgres://test", dependencies)).rejects.toThrow(
      "fixture scrape failure",
    );
    expect(calls).toEqual(["db:postgres://test", "close-fetcher", "close-db"]);
  });
});
