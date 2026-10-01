import { describe, expect, it } from "vitest";
import { seatsOpened } from "./seat-poller.js";

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
