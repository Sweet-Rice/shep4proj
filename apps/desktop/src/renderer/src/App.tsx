import { useState } from "react";
import { CompletedCourses } from "./components/CompletedCourses.js";
import { DegreeProgressScreen } from "./components/DegreeProgressScreen.js";
import { EligibleCoursesScreen } from "./components/EligibleCoursesScreen.js";
import { PlanScreen } from "./components/PlanScreen.js";
import { ScheduleScreen } from "./components/ScheduleScreen.js";

type TabId = "courses" | "progress" | "eligible" | "plan" | "schedule";

const TABS: { id: TabId; label: string }[] = [
  { id: "courses", label: "Courses" },
  { id: "progress", label: "Degree progress" },
  { id: "eligible", label: "Eligible courses" },
  { id: "plan", label: "Plan" },
  { id: "schedule", label: "Schedule" },
];

export function App() {
  const [tab, setTab] = useState<TabId>("courses");
  const activeTab = TABS.find(({ id }) => id === tab);

  if (!activeTab) throw new Error(`Unknown planner tab: ${tab}`);

  return (
    <>
      <nav role="tablist" aria-label="Planner sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "courses" ? (
          <CompletedCourses />
        ) : tab === "progress" ? (
          <DegreeProgressScreen />
        ) : tab === "eligible" ? (
          <EligibleCoursesScreen />
        ) : tab === "plan" ? (
          <PlanScreen />
        ) : (
          <ScheduleScreen />
        )}
      </section>
    </>
  );
}
