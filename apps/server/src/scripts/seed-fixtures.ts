import { existsSync } from "node:fs";
import { seedCatalogFixtures } from "../catalog/seed.js";
import { createDb } from "../db/client.js";

// Scripts run with cwd = apps/server; the repo-root .env is shared with docker compose.
if (!process.env.DATABASE_URL && existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see .env.example)");
  process.exit(1);
}

async function main(databaseUrl: string): Promise<void> {
  const { db, close } = createDb(databaseUrl);
  try {
    const count = await seedCatalogFixtures(db);
    console.log(`Seeded ${count} courses from fixtures/catalog/2026-2027`);
  } finally {
    await close();
  }
}

main(url).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
