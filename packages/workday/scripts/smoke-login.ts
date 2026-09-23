/**
 * Opt-in manual smoke test for Workday login detection (T-314). Not run in
 * CI (see AGENTS.md/CI section) — it launches a real, visible browser and
 * requires a human to complete myLSU + Microsoft SSO + Duo.
 *
 * Usage: pnpm --filter @jevschedule/workday smoke:login
 * (runs against the build output, so it builds first)
 *
 * Prints only the outcome status and browser channel — never a URL or page
 * content (see SECURITY.md).
 */
import {
  launchWorkdayBrowser,
  teardownWorkdayBrowser,
  waitForWorkdayLogin,
  WORKDAY_TENANT_URL,
} from "../dist/browser/index.js";

async function main(): Promise<void> {
  const session = await launchWorkdayBrowser({ startUrl: WORKDAY_TENANT_URL });
  console.log(`launched channel: ${session.channel}`);
  console.log("waiting for login (complete myLSU + Microsoft SSO + Duo in the opened window)...");
  console.log("close the window to test cancellation; leave it idle to test the timeout.");

  const result = await waitForWorkdayLogin(session);
  console.log(`login result: ${result.status}`);
  if (result.status === "cancelled") {
    console.log(`cancelled reason: ${result.reason}`);
  }
  if (result.status === "success") {
    console.log(`pages open at login: ${session.context.pages().length}`);
    console.log(
      `logged-in page is ${result.page === session.page ? "the initial" : "a different"} page`,
    );
  }

  // Idempotent and safe even if the window/context was already closed by
  // the user (the "cancelled" paths above).
  await teardownWorkdayBrowser(session);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
