export interface MeetingInterval {
  startMinute: number;
  endMinute: number;
}

export interface MeetingLane {
  laneIndex: number;
  laneCount: number;
}

/** Assign intervals to the lowest free lane within each transitively overlapping group. */
export function assignMeetingLanes(meetings: readonly MeetingInterval[]): MeetingLane[] {
  const lanes = meetings.map(() => ({ laneIndex: 0, laneCount: 1 }));
  const sorted = meetings
    .map((meeting, index) => ({ ...meeting, index }))
    .sort(
      (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.index - b.index,
    );

  let groupStart = 0;
  while (groupStart < sorted.length) {
    let groupEnd = groupStart + 1;
    let overlapEnd = sorted[groupStart]!.endMinute;
    while (groupEnd < sorted.length && sorted[groupEnd]!.startMinute < overlapEnd) {
      overlapEnd = Math.max(overlapEnd, sorted[groupEnd]!.endMinute);
      groupEnd += 1;
    }

    const laneEnds: number[] = [];
    for (let i = groupStart; i < groupEnd; i += 1) {
      const meeting = sorted[i]!;
      let laneIndex = laneEnds.findIndex((endMinute) => endMinute <= meeting.startMinute);
      if (laneIndex === -1) {
        laneIndex = laneEnds.length;
        laneEnds.push(meeting.endMinute);
      } else {
        laneEnds[laneIndex] = meeting.endMinute;
      }
      lanes[meeting.index] = { laneIndex, laneCount: 0 };
    }

    for (let i = groupStart; i < groupEnd; i += 1) {
      lanes[sorted[i]!.index]!.laneCount = laneEnds.length;
    }
    groupStart = groupEnd;
  }

  return lanes;
}
