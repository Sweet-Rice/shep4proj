import { greet, PACKAGE_NAME as SHARED_PACKAGE_NAME } from "@jevschedule/shared";

/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/server";

/**
 * Placeholder entry point. Confirms the server package can import from
 * @jevschedule/shared. The real Fastify skeleton lands in a later task.
 */
export function describeServer(): string {
  return `${PACKAGE_NAME} depends on ${SHARED_PACKAGE_NAME}: ${greet("server")}`;
}
