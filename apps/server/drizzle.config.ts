import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Scripts run with cwd = apps/server; the repo-root .env is shared with docker compose.
if (!process.env.DATABASE_URL && existsSync("../../.env")) process.loadEnvFile("../../.env");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
