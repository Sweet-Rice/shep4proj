import type { Schedule } from "./sections/scheduler.js";

/**
 * Stops the server in order: stop accepting requests, stop every background job (waiting for
 * any run in progress), then close the database those runs use.
 */
export async function shutdown(o: {
  app: { close(): Promise<unknown> };
  schedules: readonly (Schedule | undefined)[];
  database: { close(): Promise<void> } | undefined;
}): Promise<void> {
  await o.app.close();
  await Promise.all(o.schedules.map((schedule) => schedule?.stop()));
  await o.database?.close();
}
