// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Section } from "@jevschedule/shared";
import { WeeklyCalendar, formatMinuteToTime, formatTimeRange } from "./WeeklyCalendar.js";

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
const calendarSections: Section[] = [
  {
    ...overlappingSections[0]!,
    meetings: [{ days: ["Mon", "Wed", "Fri"], startMinute: 540, endMinute: 600 }],
  },
  {
    ...overlappingSections[1]!,
    meetings: [{ days: ["Tue", "Thu"], startMinute: 630, endMinute: 720 }],
  },
];

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

  it("formats compact time ranges, repeating the meridiem only across noon", () => {
    expect(formatTimeRange(630, 710)).toBe("10:30–11:50 AM");
    expect(formatTimeRange(990, 1160)).toBe("4:30–7:20 PM");
    expect(formatTimeRange(690, 740)).toBe("11:30 AM–12:20 PM");
  });

  it("hides the location on short blocks but keeps it in the title", () => {
    render(<WeeklyCalendar sections={[overlappingSections[0]!]} />);

    const block = screen.getByTestId("meeting-block-CSC 1350-Mon");
    expect(block).toHaveAttribute("title", expect.stringContaining("Coates 0214"));
    expect(block).toHaveAttribute("title", expect.stringContaining("Dr. Duncan"));
    expect(block).not.toHaveTextContent("Coates 0214");
  });

  it("summarizes section and credit totals and gives each course its own tone", () => {
    render(<WeeklyCalendar sections={calendarSections} />);

    expect(screen.getByText("2 sections · 8 credits")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-block-CSC 1350-Mon")).toHaveClass("tone-0");
    expect(screen.getByTestId("meeting-block-CSC 1350-Fri")).toHaveClass("tone-0");
    expect(screen.getByTestId("meeting-block-MATH 1550-Tue")).toHaveClass("tone-1");
  });

  it("extends the time grid to fit meetings outside the default hours", () => {
    const evening: Section = {
      ...overlappingSections[0]!,
      meetings: [{ days: ["Thu"], startMinute: 990, endMinute: 1160 }], // 4:30 - 7:20 PM
    };
    render(<WeeklyCalendar sections={[evening]} />);

    expect(screen.getByTestId("time-label-20")).toBeInTheDocument();
    expect(screen.queryByTestId("time-label-21")).not.toBeInTheDocument();
  });

  it("extends the time grid upward for meetings before the default start", () => {
    const early: Section = {
      ...overlappingSections[0]!,
      meetings: [{ days: ["Tue"], startMinute: 430, endMinute: 500 }], // 7:10 - 8:20 AM
    };
    render(<WeeklyCalendar sections={[early]} />);

    expect(screen.getByTestId("time-label-7")).toBeInTheDocument();
    expect(screen.queryByTestId("time-label-6")).not.toBeInTheDocument();
  });

  it("uses singular wording for one section and one credit", () => {
    const single: Section = {
      ...overlappingSections[0]!,
      credits: { ...overlappingSections[0]!.credits, min: 1, max: 1 },
    };
    render(<WeeklyCalendar sections={[single]} />);

    expect(screen.getByText("1 section · 1 credit")).toBeInTheDocument();
  });

  it("renders weekly calendar container with Mon-Fri headers and time grid", () => {
    render(<WeeklyCalendar sections={calendarSections} />);

    expect(screen.getByTestId("weekly-calendar")).toBeInTheDocument();
    expect(screen.getByText("Weekly Schedule")).toBeInTheDocument();

    ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((day) => {
      expect(screen.getByTestId(`day-header-${day}`)).toBeInTheDocument();
    });

    expect(screen.getByTestId("time-label-8")).toHaveTextContent("8:00 AM");
    expect(screen.getByTestId("time-label-12")).toHaveTextContent("12:00 PM");
  });

  it("renders the provided section meetings on their corresponding weekday columns", () => {
    render(<WeeklyCalendar sections={calendarSections} />);

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
  it("positions conflicting meetings in separate lanes", () => {
    render(<WeeklyCalendar sections={overlappingSections} />);

    const cscBlock = screen.getByTestId("meeting-block-CSC 1350-Mon");
    const mathBlock = screen.getByTestId("meeting-block-MATH 1550-Mon");
    expect(cscBlock).toHaveClass("multi-lane");
    expect(mathBlock).toHaveClass("multi-lane");

    expect(cscBlock.style.left).toBe("calc(0% + 2px)");
    expect(cscBlock.style.width).toBe("calc(50% - 4px)");
    expect(mathBlock.style.left).toBe("calc(50% + 2px)");
    expect(mathBlock.style.width).toBe("calc(50% - 4px)");
    expect(screen.getByTestId(`conflict-badge-${cscSectionKey}`)).toHaveAccessibleName("Conflict");
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
