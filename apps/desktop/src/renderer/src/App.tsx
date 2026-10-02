import { useRef, useState } from "react";
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
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());
  const activeTab = TABS.find(({ id }) => id === tab);

  if (!activeTab) throw new Error(`Unknown planner tab: ${tab}`);

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const currentIndex = TABS.findIndex(({ id }) => id === tab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % TABS.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex];
    if (!next) return;
    setTab(next.id);
    tabRefs.current.get(next.id)?.focus();
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true" />
          <span>JevSchedule</span>
        </div>
        <nav
          role="tablist"
          aria-label="Planner sections"
          aria-orientation="vertical"
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              ref={(element) => {
                if (element) tabRefs.current.set(id, element);
                else tabRefs.current.delete(id);
              }}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <section
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="app-content"
      >
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
    </div>
  );
}
