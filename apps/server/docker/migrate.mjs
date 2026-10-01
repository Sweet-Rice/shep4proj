// Applies the Drizzle migrations in ../drizzle to DATABASE_URL. Used in the production image,
// which has no drizzle-kit (a dev dependency): `docker run ... node docker/migrate.mjs`.
// drizzle-kit migrate runs this same migrator with the same defaults (table
// drizzle.__drizzle_migrations), so the two can be used on one database interchangeably.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder });
  console.log("Migrations applied");
} catch (error) {
  // Drizzle wraps driver errors ("Failed query: ..."); the cause says why (auth, network, SQL).
  const message = (e) => (e instanceof Error ? e.message : String(e));
  const cause = error instanceof Error && error.cause ? `: ${message(error.cause)}` : "";
  console.error(`Migration failed: ${message(error)}${cause}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
