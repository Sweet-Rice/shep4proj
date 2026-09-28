import { describe, expect, it } from "vitest";
import { CourseSchema } from "./course.js";

const course = {
  code: "CSC 1253",
  title: "Computer Science I",
  credits: 3,
  description: "Introduction to programming.",
  prerequisiteText: null,
};

describe("CourseSchema", () => {
  it("accepts a catalog course without prerequisites", () => {
    expect(CourseSchema.parse(course)).toEqual(course);
  });

  it("keeps original prerequisite wording for later parsing", () => {
    const withPrerequisites = { ...course, prerequisiteText: "MATH 1550 or equivalent" };
    expect(CourseSchema.parse(withPrerequisites).prerequisiteText).toBe("MATH 1550 or equivalent");
  });

  it("rejects an incomplete course or invalid credits", () => {
    expect(CourseSchema.safeParse({ ...course, title: "" }).success).toBe(false);
    expect(CourseSchema.safeParse({ ...course, credits: -1 }).success).toBe(false);
    expect(CourseSchema.safeParse({ ...course, credits: Number.NaN }).success).toBe(false);
  });
});
