// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Section } from "@jevschedule/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionList } from "./SectionList.js";

const fall: Section = {
  term: "LSUAM_FALL_2026",
  courseCode: "CSC 4330",
  sectionNumber: "001",
  sectionType: "LEC",
  credits: { min: 3, max: 3, note: null },
  instructor: "Dr. Shepherd",
  location: "PFT 1206",
  deliveryMode: "On Campus",
  enrollment: 28,
  capacity: 30,
  meetings: [{ days: ["Mon", "Wed"], startMinute: 540, endMinute: 600 }],
};
const spring: Section = {
  ...fall,
  term: "LSUAM_SPRING_2027",
  sectionNumber: "002",
  instructor: null,
  location: null,
  enrollment: 30,
  meetings: [],
};
const other: Section = { ...fall, courseCode: "CSC 1350", sectionNumber: "003" };

describe("SectionList", () => {
  afterEach(cleanup);

  it("shows a course's sections with meetings, instructor, location, and seats", () => {
    render(<SectionList courseCode="CSC 4330" sections={[other, spring, fall]} />);

    expect(screen.getByRole("region", { name: "Sections for CSC 4330" })).toBeInTheDocument();
    expect(screen.getByText("001-LEC")).toBeInTheDocument();
    expect(screen.getByText("002-LEC")).toBeInTheDocument();
    expect(screen.queryByText("003-LEC")).not.toBeInTheDocument();
    expect(screen.getByText(/Mon, Wed 9:00 AM/)).toBeInTheDocument();
    expect(screen.getByText("Meeting time TBA")).toBeInTheDocument();
    expect(screen.getByText("Dr. Shepherd")).toBeInTheDocument();
    expect(screen.getByText("Instructor TBA")).toBeInTheDocument();
    expect(screen.getByText("PFT 1206")).toBeInTheDocument();
    expect(screen.getByText("Location TBA")).toBeInTheDocument();
    expect(screen.getByText("2 seats available")).toBeInTheDocument();
    expect(screen.getByText("Full")).toBeInTheDocument();
  });

  it("filters to a requested term and shows a helpful empty state", () => {
    const { rerender } = render(
      <SectionList courseCode="CSC 4330" term="LSUAM_FALL_2026" sections={[fall, spring]} />,
    );
    expect(screen.getByText("001-LEC")).toBeInTheDocument();
    expect(screen.queryByText("002-LEC")).not.toBeInTheDocument();

    rerender(<SectionList courseCode="CSC 9999" sections={[fall, spring]} />);
    expect(screen.getByText("No sections listed.")).toBeInTheDocument();
  });

  it("passes the chosen section to the schedule callback", async () => {
    const onAddSection = vi.fn();
    render(<SectionList courseCode="CSC 4330" sections={[fall]} onAddSection={onAddSection} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Add to schedule" }));
    expect(onAddSection).toHaveBeenCalledTimes(1);
    expect(onAddSection).toHaveBeenCalledWith(fall);
  });
});
