import { existsSync } from "node:fs";
import { buildServer } from "./app.js";
import { readListenConfig } from "./config.js";
import { createDb } from "./db/client.js";

if (!process.env["DATABASE_URL"] && existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

const { host, port } = readListenConfig();

const databaseUrl = process.env["DATABASE_URL"];
let dbClose: (() => Promise<void>) | undefined;
let app;

if (databaseUrl) {
  const { db, close } = createDb(databaseUrl);
  dbClose = close;
  app = buildServer({ db, logger: true });
} else {
  app = buildServer({ logger: true });
  app.log.warn("DATABASE_URL is not set; /courses routes are disabled (see .env.example)");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    app
      .close()
      .then(async () => {
        if (dbClose) {
          await dbClose();
        }
        process.exit(0);
      })
      .catch((error: unknown) => {
        app.log.error(error, "error during shutdown");
        process.exit(1);
      });
  });
}

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error, "failed to start");
  process.exit(1);
}
