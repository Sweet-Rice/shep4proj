import { describe, expect, it } from "vitest";
import { assignMeetingLanes } from "./meeting-lanes.js";

describe("assignMeetingLanes", () => {
  it("assigns separate lanes to non-overlapping meetings", () => {
    expect(
      assignMeetingLanes([
        { startMinute: 540, endMinute: 600 },
        { startMinute: 660, endMinute: 720 },
      ]),
    ).toEqual([
      { laneIndex: 0, laneCount: 1 },
      { laneIndex: 0, laneCount: 1 },
    ]);
  });

  it("uses two lanes for overlapping meetings", () => {
    expect(
      assignMeetingLanes([
        { startMinute: 540, endMinute: 600 },
        { startMinute: 570, endMinute: 630 },
      ]),
    ).toEqual([
      { laneIndex: 0, laneCount: 2 },
      { laneIndex: 1, laneCount: 2 },
    ]);
  });

  it("reuses a lane when A overlaps B and B overlaps C but A does not overlap C", () => {
    expect(
      assignMeetingLanes([
        { startMinute: 540, endMinute: 600 },
        { startMinute: 570, endMinute: 630 },
        { startMinute: 600, endMinute: 660 },
      ]),
    ).toEqual([
      { laneIndex: 0, laneCount: 2 },
      { laneIndex: 1, laneCount: 2 },
      { laneIndex: 0, laneCount: 2 },
    ]);
  });

  it("does not treat back-to-back meetings as overlapping", () => {
    expect(
      assignMeetingLanes([
        { startMinute: 540, endMinute: 600 },
        { startMinute: 600, endMinute: 660 },
      ]),
    ).toEqual([
      { laneIndex: 0, laneCount: 1 },
      { laneIndex: 0, laneCount: 1 },
    ]);
  });
});
