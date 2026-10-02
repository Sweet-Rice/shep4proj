import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { launchWorkdayBrowser } from "./launch.js";
import { teardownWorkdayBrowser } from "./teardown.js";
import { makeFakeChromium, pathExists } from "./test-support.js";

let profileRoot: string;

beforeEach(async () => {
  profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jevschedule-wd-test-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
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

  it("retries a profile removal blocked by a browser that is still exiting", async () => {
    const { chromium } = makeFakeChromium(["msedge"]);
    const session = await launchWorkdayBrowser({
      startUrl: "https://example.com/workday",
      chromium,
      profileRoot,
    });
    vi.useFakeTimers();
    const realRm = fs.rm.bind(fs);
    const busy = Object.assign(new Error("resource busy or locked"), { code: "EBUSY" });
    const rm = vi.spyOn(fs, "rm").mockRejectedValueOnce(busy).mockRejectedValueOnce(busy);
    rm.mockImplementation(realRm);

    const done = teardownWorkdayBrowser(session);
    await vi.advanceTimersByTimeAsync(5_000);
    await done;

    expect(rm).toHaveBeenCalledTimes(3);
    expect(await pathExists(session.profileDir)).toBe(false);
  });

  it("does not retry an unrelated removal error", async () => {
    const { chromium } = makeFakeChromium(["msedge"]);
    const session = await launchWorkdayBrowser({
      startUrl: "https://example.com/workday",
      chromium,
      profileRoot,
    });
    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    const rm = vi.spyOn(fs, "rm").mockRejectedValue(denied);

    await expect(teardownWorkdayBrowser(session)).rejects.toThrow("denied");
    expect(rm).toHaveBeenCalledTimes(1);
  });
});
