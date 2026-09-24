import { greet, PACKAGE_NAME as SHARED_PACKAGE_NAME } from "@jevschedule/shared";

/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/server";

export { buildServer, type HealthResponse } from "./app.js";
export { readListenConfig, type ListenConfig } from "./config.js";

/**
 * Confirms the server package can import from @jevschedule/shared. The
 * runnable server is `main.ts` (`pnpm --filter @jevschedule/server start`).
 */
export function describeServer(): string {
  return `${PACKAGE_NAME} depends on ${SHARED_PACKAGE_NAME}: ${greet("server")}`;
}
