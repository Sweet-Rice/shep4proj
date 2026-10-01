import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  nextSeatPollDelayMs,
  SEAT_POLL_RETRY_BASE_MS,
  seatsOpened,
  startSeatPoller,
  type SeatPollResult,
} from "./seat-poller.js";

const counts = (enrollment: number, capacity: number) => ({ enrollment, capacity });

describe("seatsOpened", () => {
  it.each([
    [counts(40, 40), counts(38, 40)],
    [counts(42, 40), counts(39, 40)],
    [counts(0, 0), counts(0, 5)],
    [counts(40, 40), counts(40, 41)],
  ])("is true for full %j -> open %j", (before, after) => {
    expect(seatsOpened(before, after)).toBe(true);
  });

  it.each([
    [counts(30, 40), counts(38, 40)],
    [counts(38, 40), counts(40, 40)],
    [counts(40, 40), counts(40, 40)],
    [counts(42, 40), counts(40, 40)],
    [counts(0, 5), counts(0, 0)],
  ])("is false for %j -> %j", (before, after) => {
    expect(seatsOpened(before, after)).toBe(false);
  });
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const clean: SeatPollResult = { opened: 0, failed: [], unlistedTerms: [], missingSections: 0 };
const failed: SeatPollResult = {
  ...clean,
  failed: [{ department: "CSC", term: "LSUAM_FALL_2026", error: "section fetch failed: 503" }],
};
const unlisted: SeatPollResult = { ...clean, unlistedTerms: ["CSC LSUAM_SPRING_2026"] };

/** A poll that plays `outcomes` in order (then stays clean) and records when it ran. */
function scriptedPoll(outcomes: (SeatPollResult | Error)[]) {
  const start = Date.now();
  const times: number[] = [];
  const poll = vi.fn(async () => {
    times.push(Date.now() - start);
    const outcome = outcomes.shift() ?? clean;
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { poll, times };
}

describe("nextSeatPollDelayMs", () => {
  it("waits the interval after a clean poll and doubles from 15 minutes up to it after failures", () => {
    expect(SEAT_POLL_RETRY_BASE_MS).toBe(15 * MINUTE);
    expect([0, 1, 2, 3, 7, 8, 50].map((n) => nextSeatPollDelayMs(n, DAY))).toEqual([
      DAY,
      15 * MINUTE,
      30 * MINUTE,
      HOUR,
      16 * HOUR,
      DAY,
      DAY,
    ]);
    expect(nextSeatPollDelayMs(3, HOUR)).toBe(HOUR);
  });
});

describe("startSeatPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits 15 minutes before the first poll, so a restart loop never reaches the portal", async () => {
    const { poll, times } = scriptedPoll([]);
    const poller = startSeatPoller({ poll, intervalMs: DAY, onError: vi.fn() });
    expect(poll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15 * MINUTE - 1);
    expect(poll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(times).toEqual([15 * MINUTE]);
    await poller.stop();

    const restarted = scriptedPoll([]);
    await startSeatPoller({ poll: restarted.poll, intervalMs: DAY, onError: vi.fn() }).stop();
    await vi.advanceTimersByTimeAsync(DAY);
    expect(restarted.poll).not.toHaveBeenCalled();
  });

  it("polls once per interval after the first poll", async () => {
    const { poll, times } = scriptedPoll([]);
    const poller = startSeatPoller({ poll, intervalMs: DAY, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(15 * MINUTE + 3 * DAY);
    expect(times).toEqual([0, DAY, 2 * DAY, 3 * DAY].map((time) => 15 * MINUTE + time));
    await poller.stop();
  });

  it("backs off exponentially after failed polls and returns to the interval after a clean one", async () => {
    const error = new Error("portal down");
    const { poll, times } = scriptedPoll([failed, error, failed, clean]);
    const onError = vi.fn();
    const poller = startSeatPoller({ poll, intervalMs: DAY, onError });

    await vi.advanceTimersByTimeAsync(2 * DAY);
    const gaps = times.slice(1).map((time, i) => time - times[i]!);
    expect(gaps).toEqual([15 * MINUTE, 30 * MINUTE, HOUR, DAY]);
    expect(onError.mock.calls).toEqual([[error]]);
    await poller.stop();
  });

  it("never waits longer than the interval while failures continue", async () => {
    const { poll, times } = scriptedPoll(Array.from({ length: 20 }, () => failed));
    const poller = startSeatPoller({ poll, intervalMs: 2 * HOUR, onError: vi.fn() });

    await vi.advanceTimersByTimeAsync(10 * HOUR);
    const gaps = times.slice(1).map((time, i) => time - times[i]!);
    expect(gaps.slice(0, 4)).toEqual([15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR]);
    expect(Math.max(...gaps)).toBe(2 * HOUR);
    await poller.stop();
  });

  it("does not back off for terms the portal no longer lists", async () => {
    const { poll, times } = scriptedPoll([unlisted, unlisted]);
    const poller = startSeatPoller({ poll, intervalMs: DAY, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(15 * MINUTE + DAY);
    expect(times).toEqual([15 * MINUTE, 15 * MINUTE + DAY]);
    await poller.stop();
  });

  it("waits for a slow poll to finish, and polls nothing more after stop()", async () => {
    let finish: (result: SeatPollResult) => void = () => undefined;
    const poll = vi.fn(
      () =>
        new Promise<SeatPollResult>((resolve) => {
          finish = resolve;
        }),
    );
    const poller = startSeatPoller({ poll, intervalMs: HOUR, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(poll).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = poller.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    finish(clean);
    await stopping;
    await vi.advanceTimersByTimeAsync(5 * HOUR);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
