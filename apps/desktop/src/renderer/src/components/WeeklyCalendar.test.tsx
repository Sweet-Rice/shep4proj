// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Section } from "@jevschedule/shared";
import { WeeklyCalendar, formatMinuteToTime, SAMPLE_SECTIONS } from "./WeeklyCalendar.js";

const overlappingSections: Section[] = [
  {
    term: "LSUAM_FALL_2026",
    courseCode: "CSC 1350",
    sectionNumber: "001",
    sectionType: "LEC",
    credits: { min: 3, max: 3, note: null },
    instructor: "Dr. Duncan",
    location: "Coates 0214",
    deliveryMode: "In Person",
    enrollment: 45,
    capacity: 50,
    meetings: [{ days: ["Mon"], startMinute: 540, endMinute: 600 }], // 9:00 - 10:00 AM
  },
  {
    term: "LSUAM_FALL_2026",
    courseCode: "MATH 1550",
    sectionNumber: "001",
    sectionType: "LEC",
    credits: { min: 5, max: 5, note: null },
    instructor: "Dr. Smith",
    location: "Lockett 0101",
    deliveryMode: "In Person",
    enrollment: 40,
    capacity: 40,
    meetings: [{ days: ["Mon"], startMinute: 570, endMinute: 630 }], // 9:30 - 10:30 AM (overlap!)
  },
];

const cscSectionKey = "LSUAM_FALL_2026|CSC 1350|001|LEC";

describe("WeeklyCalendar & formatMinuteToTime", () => {
  afterEach(() => {
    cleanup();
  });

  it("formats minutes after midnight accurately to 12-hour AM/PM string", () => {
    expect(formatMinuteToTime(480)).toBe("8:00 AM");
    expect(formatMinuteToTime(540)).toBe("9:00 AM");
    expect(formatMinuteToTime(720)).toBe("12:00 PM");
    expect(formatMinuteToTime(780)).toBe("1:00 PM");
    expect(formatMinuteToTime(1020)).toBe("5:00 PM");
  });

  it("renders weekly calendar container with Mon-Fri headers and time grid", () => {
    render(<WeeklyCalendar sections={SAMPLE_SECTIONS} />);

    expect(screen.getByTestId("weekly-calendar")).toBeInTheDocument();
    expect(screen.getByText("Weekly Schedule")).toBeInTheDocument();

    ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((day) => {
      expect(screen.getByTestId(`day-header-${day}`)).toBeInTheDocument();
    });

    expect(screen.getByTestId("time-label-8")).toHaveTextContent("8:00 AM");
    expect(screen.getByTestId("time-label-12")).toHaveTextContent("12:00 PM");
  });

  it("renders sample section meeting blocks on corresponding weekday columns", () => {
    render(<WeeklyCalendar sections={SAMPLE_SECTIONS} />);

    // CSC 1350 meets Mon, Wed, Fri
    expect(screen.getByTestId("meeting-block-CSC 1350-Mon")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-block-CSC 1350-Wed")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-block-CSC 1350-Fri")).toBeInTheDocument();

    // MATH 1550 meets Tue, Thu
    expect(screen.getByTestId("meeting-block-MATH 1550-Tue")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-block-MATH 1550-Thu")).toBeInTheDocument();
  });

  it("highlights overlapping section meetings with red conflict style and alert banner", () => {
    render(<WeeklyCalendar sections={overlappingSections} />);

    expect(screen.getByTestId("schedule-conflict-banner")).toBeInTheDocument();

    const cscBlock = screen.getByTestId("meeting-block-CSC 1350-Mon");
    const mathBlock = screen.getByTestId("meeting-block-MATH 1550-Mon");

    expect(cscBlock).toHaveClass("conflict");
    expect(mathBlock).toHaveClass("conflict");
    expect(screen.getByTestId(`conflict-badge-${cscSectionKey}`)).toBeInTheDocument();
  });

  it("does not flag sections from different terms", () => {
    const fallSection = overlappingSections[0]!;
    const springSection: Section = { ...fallSection, term: "LSUAM_SPRING_2027" };

    render(<WeeklyCalendar sections={[fallSection, springSection]} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const meetingBlocks = screen.getAllByTestId("meeting-block-CSC 1350-Mon");
    expect(meetingBlocks).toHaveLength(2);
    expect(screen.queryByTestId(`conflict-badge-${cscSectionKey}`)).not.toBeInTheDocument();
    for (const block of meetingBlocks) {
      expect(block).not.toHaveClass("conflict");
    }
  });

  it("calls onRemoveSection when remove button is clicked", async () => {
    const user = userEvent.setup();
    const handleRemove = vi.fn();

    render(<WeeklyCalendar sections={overlappingSections} onRemoveSection={handleRemove} />);

    const removeBtn = screen.getByTestId(`remove-section-${cscSectionKey}`);

    await user.click(removeBtn);

    expect(handleRemove).toHaveBeenCalledWith(cscSectionKey);
  });
});
