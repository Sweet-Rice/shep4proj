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

// Error messages can carry DATABASE_URL or pieces of it, password included: the URL parser's
// error holds the whole URL, network errors name the host, and the server echoes the user and
// database names. A malformed URL can put part of the password in any of those, so a failure
// prints only the error code and a fixed hint, never a message, cause or stack.
const hints = {
  ERR_INVALID_URL: "DATABASE_URL is not a valid URL; percent-encode special characters",
  URIError: "DATABASE_URL is not a valid URL; percent-encode special characters",
  ENOTFOUND: "database host not found",
  EAI_AGAIN: "database host lookup failed",
  ECONNREFUSED: "database refused the connection",
  ETIMEDOUT: "connection to the database timed out",
  CONNECT_TIMEOUT: "connection to the database timed out",
  "28P01": "password authentication failed",
  28000: "database rejected the connection (role or pg_hba.conf)",
  "3D000": "database does not exist",
};

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
let client;
try {
  client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder });
  console.log("Migrations applied");
} catch (error) {
  // Drizzle wraps driver errors ("Failed query: ..."); the driver's code is on the cause.
  const raw = error?.code ?? error?.cause?.code ?? (error instanceof URIError ? "URIError" : "");
  const code = /^[A-Za-z0-9_]{1,40}$/.test(String(raw)) ? String(raw) : "unknown";
  const hint = hints[code] ? `: ${hints[code]}` : "";
  console.error(`Migration failed (${code})${hint}`);
  process.exitCode = 1;
} finally {
  await client?.end();
}
