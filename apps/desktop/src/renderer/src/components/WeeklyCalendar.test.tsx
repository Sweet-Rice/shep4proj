// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { WeeklyCalendar, formatMinuteToTime, SAMPLE_SECTIONS } from "./WeeklyCalendar.js";

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
    expect(screen.getByTestId("meeting-block-CSC 1350-Mon")).toHaveTextContent("CSC 1350");
    expect(screen.getByTestId("meeting-block-CSC 1350-Wed")).toHaveTextContent("CSC 1350");
    expect(screen.getByTestId("meeting-block-CSC 1350-Fri")).toHaveTextContent("CSC 1350");

    // MATH 1550 meets Tue, Thu
    expect(screen.getByTestId("meeting-block-MATH 1550-Tue")).toHaveTextContent("MATH 1550");
    expect(screen.getByTestId("meeting-block-MATH 1550-Thu")).toHaveTextContent("MATH 1550");
  });

  it("renders section location and time details in meeting block", () => {
    render(<WeeklyCalendar sections={SAMPLE_SECTIONS} />);

    const cscBlock = screen.getByTestId("meeting-block-CSC 1350-Mon");
    expect(cscBlock).toHaveTextContent("001-LEC");
    expect(cscBlock).toHaveTextContent("Coates 0214");
    expect(cscBlock).toHaveTextContent("9:00 AM – 10:00 AM");
  });
});
