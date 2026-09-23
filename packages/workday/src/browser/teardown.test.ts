import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { launchWorkdayBrowser } from "./launch.js";
import { teardownWorkdayBrowser } from "./teardown.js";
import { makeFakeChromium, pathExists } from "./test-support.js";

let profileRoot: string;

beforeEach(async () => {
  profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jevschedule-wd-test-"));
});

afterEach(async () => {
  await fs.rm(profileRoot, { recursive: true, force: true });
});

describe("teardownWorkdayBrowser", () => {
  it("closes the context, removes the profile dir, and verifies it is gone", async () => {
    const { chromium, contexts } = makeFakeChromium(["msedge"]);
    const session = await launchWorkdayBrowser({
      startUrl: "https://example.com/workday",
      chromium,
      profileRoot,
    });

    await teardownWorkdayBrowser(session);

    expect(contexts[0]?.closed).toBe(true);
    expect(await pathExists(session.profileDir)).toBe(false);
  });

  it("is idempotent and tolerates an already-closed context", async () => {
    const { chromium } = makeFakeChromium(["msedge"]);
    const session = await launchWorkdayBrowser({
      startUrl: "https://example.com/workday",
      chromium,
      profileRoot,
    });

    await teardownWorkdayBrowser(session);
    await expect(teardownWorkdayBrowser(session)).resolves.toBeUndefined();

    expect(await pathExists(session.profileDir)).toBe(false);
  });
});
