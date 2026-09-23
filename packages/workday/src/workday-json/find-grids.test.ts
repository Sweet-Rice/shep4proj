import { describe, expect, it } from "vitest";

import { findGrids } from "./find-grids.ts";

describe("findGrids", () => {
  it("finds a grid nested several levels deep under arbitrary keys", () => {
    const root = {
      body: {
        widget: "panel",
        label: "Academics",
        sections: [
          {
            nested: {
              widget: "grid",
              label: "Enrollments",
              columns: [{ columnId: "90.2", label: "Course" }],
              rows: [],
            },
          },
        ],
      },
    };

    const grids = findGrids(root, "root");
    expect(grids).toHaveLength(1);
    expect(grids[0]?.node.label).toBe("Enrollments");
    expect(grids[0]?.path).toBe("root.body.sections[0].nested");
  });

  it("finds multiple sibling and nested grids", () => {
    const root = {
      widget: "panel",
      children: [
        { widget: "grid", label: "A", rows: [] },
        {
          widget: "panelList",
          items: [{ widget: "grid", label: "B", rows: [] }],
        },
      ],
    };

    // Default options only track "panel" as a panel-like widget, but
    // grids nested under any key (including inside a panelList) are still
    // found regardless.
    const grids = findGrids(root);
    expect(grids.map((g) => g.node.label).sort()).toEqual(["A", "B"]);
  });

  it("skips maxLengthValueRow and maxWordLengthValueRow scratch keys entirely", () => {
    const root = {
      widget: "grid",
      label: "Enrollments",
      rows: [],
      maxLengthValueRow: {
        // If this were traversed, it would surface as a second "grid" (a
        // decoy) — it must never be visited.
        widget: "grid",
        label: "Decoy",
        rows: [],
      },
      maxWordLengthValueRow: {
        widget: "grid",
        label: "AnotherDecoy",
        rows: [],
      },
    };

    const grids = findGrids(root);
    expect(grids).toHaveLength(1);
    expect(grids[0]?.node.label).toBe("Enrollments");
  });

  it("tracks the enclosing panel stack (label and title) by default", () => {
    const root = {
      widget: "panel",
      label: "Fall Semester 2025",
      body: {
        widget: "panel",
        title: "Coursework",
        grid: { widget: "grid", label: "Enrollments", rows: [] },
      },
    };

    const grids = findGrids(root);
    expect(grids).toHaveLength(1);
    expect(grids[0]?.panelStack).toEqual([
      { kind: "panel", label: "Fall Semester 2025" },
      { kind: "panel", title: "Coursework" },
    ]);
  });

  it("only tracks panelList context when explicitly opted in via panelWidgets", () => {
    const root = {
      widget: "panelList",
      label: "My Courses",
      grid: { widget: "grid", label: "Current", rows: [] },
    };

    const withoutPanelList = findGrids(root);
    expect(withoutPanelList[0]?.panelStack).toEqual([]);

    const withPanelList = findGrids(root, "", { panelWidgets: ["panel", "panelList"] });
    expect(withPanelList[0]?.panelStack).toEqual([{ kind: "panelList", label: "My Courses" }]);
  });

  it("does not descend into a grid node looking for nested grids", () => {
    const root = {
      widget: "grid",
      label: "Outer",
      rows: [],
      weirdNestedGrid: { widget: "grid", label: "Inner", rows: [] },
    };

    const grids = findGrids(root);
    expect(grids).toHaveLength(1);
    expect(grids[0]?.node.label).toBe("Outer");
  });

  it("returns an empty array for non-object input", () => {
    expect(findGrids(null)).toEqual([]);
    expect(findGrids("string")).toEqual([]);
    expect(findGrids(42)).toEqual([]);
    expect(findGrids([1, 2, 3])).toEqual([]);
  });
});
