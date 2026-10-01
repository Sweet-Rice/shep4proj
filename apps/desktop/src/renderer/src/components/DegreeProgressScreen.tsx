import type { DegreeProgram } from "@jevschedule/shared";
import { useCompletedCourses } from "../hooks/useCompletedCourses.js";
import { DegreeProgressView } from "./DegreeProgressView.js";

export const SAMPLE_DEGREE_PROGRAM: DegreeProgram = {
  id: "csc-se-2026-2027",
  program: "Computer Science, B.S.",
  concentration: "Software Engineering",
  catalogYear: "2026-2027",
  totalCredits: 120,
  source: "https://catalog.lsu.edu/preview_program.php?catoid=35&poid=14278",
  requirements: [
    {
      kind: "fixed",
      id: "sem-1-courses",
      label: "Semester 1 Core Courses",
      semester: 1,
      courses: [
        { code: "CSC 1350", minGrade: "C" },
        { code: "MATH 1550", minGrade: "C" },
        { code: "ENGL 1001", minGrade: "C" },
      ],
    },
    {
      kind: "fixed",
      id: "sem-2-courses",
      label: "Semester 2 Core Courses",
      semester: 2,
      courses: [
        { code: "CSC 1351", minGrade: "C" },
        { code: "MATH 1552", minGrade: "C" },
      ],
    },
    {
      kind: "chooseN",
      id: "choose-science",
      label: "Science Sequence Elective",
      semester: 2,
      n: 1,
      options: [
        { code: "BIOL 1001", minGrade: null },
        { code: "CHEM 1201", minGrade: null },
        { code: "PHYS 2110", minGrade: null },
      ],
    },
    {
      kind: "creditBucket",
      id: "gened-humanities",
      label: "General Education Humanities",
      semester: 3,
      credits: 6,
      category: "Humanities",
      eligibleCourses: [
        { code: "HIST 1001", minGrade: null },
        { code: "PHIL 1000", minGrade: null },
        { code: "ENGL 2000", minGrade: "C" },
      ],
    },
  ],
};

export interface DegreeProgressScreenProps {
  degree?: DegreeProgram;
}

export function DegreeProgressScreen({
  degree = SAMPLE_DEGREE_PROGRAM,
}: DegreeProgressScreenProps) {
  const { completed, loaded, error, toggleCourse } = useCompletedCourses();

  return (
    <main className="degree-progress-screen">
      <h1>Degree Progress</h1>
      <p className="subtitle">Track your degree requirements and completion status in real-time.</p>

      {error && (
        <p role="alert" className="error-message">
          Could not load or update completed courses. Please try again.
        </p>
      )}

      {!loaded ? (
        <p role="status">Loading degree progress…</p>
      ) : (
        <DegreeProgressView
          degree={degree}
          completed={completed}
          onToggleCourse={(code) => {
            void toggleCourse(code);
          }}
        />
      )}
    </main>
  );
}
