import { useRef, useState } from "react";
import { CompletedCourses } from "./components/CompletedCourses.js";
import { DegreeProgressScreen } from "./components/DegreeProgressScreen.js";
import { EligibleCoursesScreen } from "./components/EligibleCoursesScreen.js";
import { PlanScreen } from "./components/PlanScreen.js";
import { ScheduleScreen } from "./components/ScheduleScreen.js";

type TabId = "courses" | "progress" | "eligible" | "plan" | "schedule";

const TABS: { id: TabId; label: string; icon: string[] }[] = [
  {
    id: "courses",
    label: "Courses",
    icon: ["M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z", "M5 17a3 3 0 0 1 3-3h11"],
  },
  { id: "progress", label: "Degree progress", icon: ["M5 20v-6", "M12 20V6", "M19 20v-10"] },
  {
    id: "eligible",
    label: "Eligible courses",
    icon: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "m8 12 3 3 5-6"],
  },
  {
    id: "plan",
    label: "Plan",
    icon: ["M3 7l9-4 9 4-9 4z", "M3 12l9 4 9-4", "M3 17l9 4 9-4"],
  },
  {
    id: "schedule",
    label: "Schedule",
    icon: [
      "M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
      "M4 10h16",
      "M8 3v4",
      "M16 3v4",
    ],
  },
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
          <svg className="app-brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" />
            <path d="M19 8v11a4 4 0 0 1-4 4h-1.5a3.5 3.5 0 0 1-3.5-3.5" />
          </svg>
          <span className="app-brand-text">
            <span className="app-brand-name">JevSchedule</span>
            <span className="app-brand-tag">Degree planner</span>
          </span>
        </div>
        <nav
          role="tablist"
          aria-label="Planner sections"
          aria-orientation="vertical"
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map(({ id, label, icon }) => (
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
              <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                {icon.map((d) => (
                  <path key={d} d={d} />
                ))}
              </svg>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <p className="app-sidebar-footer">Your plan stays on this device.</p>
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
