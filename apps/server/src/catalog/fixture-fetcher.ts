import fs from "node:fs/promises";
import path from "node:path";
import type { CatalogFetcher } from "@jevschedule/scraper";

export const FIXTURE_DETAIL_COIDS = {
  "CSC 1350": "229578",
  "CSC 2700": "229586",
  "CSC 3102": "229589",
  "CSC 3200": "233370",
  "CSC 4330": "232623",
} as const;

export function createFixtureFetcher(fixtureDir: string): CatalogFetcher {
  return {
    async fetchHtml(url: string): Promise<string> {
      const parsed = new URL(url);
      if (
        parsed.pathname.includes("/content.php") &&
        parsed.searchParams.get("filter[27]") === "CSC"
      ) {
        const cpage = Number(parsed.searchParams.get("filter[cpage]") ?? "1");
        if (cpage === 1) {
          return await fs.readFile(path.join(fixtureDir, "csc-course-list.html"), "utf8");
        }
        if (cpage > 1) {
          return "<html><body></body></html>";
        }
      }

      const coid = parsed.searchParams.get("coid");
      if (coid !== null) {
        const found = Object.entries(FIXTURE_DETAIL_COIDS).find(([, id]) => id === coid);
        if (found !== undefined) {
          const num = found[0].split(" ")[1]?.toLowerCase();
          return await fs.readFile(path.join(fixtureDir, `course-csc-${num}.html`), "utf8");
        }
      }

      throw new Error(`no fixture for ${url}`);
    },
    async close(): Promise<void> {},
  };
}
