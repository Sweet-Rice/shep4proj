import { buildServer } from "./app.js";
import { readListenConfig } from "./config.js";

const { host, port } = readListenConfig();
const app = buildServer({ logger: true });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error(error, "error during shutdown");
        process.exit(1);
      },
    );
  });
}

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error, "failed to start");
  process.exit(1);
}
