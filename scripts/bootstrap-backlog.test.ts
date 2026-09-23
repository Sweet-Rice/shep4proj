import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePlan, expandDepends } from "./bootstrap-backlog.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// The script's default --plan is "../shep4proj.wiki/Project-Plan.md" relative
// to the repo root, which is where it lives next to a normal clone of this
// repo. When this repo is checked out as a git worktree (e.g.
// shep4proj-wt/<branch>/), the wiki checkout is a sibling of the *worktree
// container*, not of the individual worktree, so fall back to that layout
// too. Skip entirely if neither is found.
const CANDIDATE_PLAN_PATHS = [
  resolve(REPO_ROOT, "../shep4proj.wiki/Project-Plan.md"),
  resolve(REPO_ROOT, "../../shep4proj.wiki/Project-Plan.md"),
];
const PLAN_PATH = CANDIDATE_PLAN_PATHS.find((p) => existsSync(p)) ?? CANDIDATE_PLAN_PATHS[0]!;

const planExists = existsSync(PLAN_PATH);

// Hard-coded from `grep -cE '^\| T-[0-9]{3} \|' Project-Plan.md` against the
// real plan file at the time this test was written. If the plan changes,
// recompute and update this constant.
const EXPECTED_TASK_COUNT = 99;

test(
  "plan file present",
  { skip: !planExists ? "Project-Plan.md not found; skipping plan-dependent tests" : false },
  () => {
    assert.ok(planExists);
  }
);

test(
  "parses 8 milestones (M0-M7)",
  { skip: !planExists },
  () => {
    const plan = parsePlan(readFileSync(PLAN_PATH, "utf8"));
    assert.equal(plan.milestones.length, 8);
    assert.deepEqual(
      plan.milestones.map((m) => m.key),
      ["M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7"]
    );
  }
);

test(
  "parses 18 stories (US-00..US-17)",
  { skip: !planExists },
  () => {
    const plan = parsePlan(readFileSync(PLAN_PATH, "utf8"));
    assert.equal(plan.stories.length, 18);
    const expectedIds = Array.from({ length: 18 }, (_, i) => `US-${String(i).padStart(2, "0")}`);
    assert.deepEqual(
      plan.stories.map((s) => s.id),
      expectedIds
    );
  }
);

test(
  `total task count equals ${EXPECTED_TASK_COUNT} (matches grep of T- rows in plan)`,
  { skip: !planExists },
  () => {
    const plan = parsePlan(readFileSync(PLAN_PATH, "utf8"));
    assert.equal(plan.tasks.length, EXPECTED_TASK_COUNT);
  }
);

test(
  "grep-computed task row count matches the hard-coded expectation",
  { skip: !planExists },
  () => {
    const grepped = execSync(
      `grep -cE '^\\| T-[0-9]{3} \\|' ${JSON.stringify(PLAN_PATH)}`,
      { encoding: "utf8" }
    ).trim();
    assert.equal(Number(grepped), EXPECTED_TASK_COUNT);
  }
);

test(
  "T-104 depends expands to T-101,T-102,T-103",
  { skip: !planExists },
  () => {
    const plan = parsePlan(readFileSync(PLAN_PATH, "utf8"));
    const t104 = plan.tasks.find((t) => t.id === "T-104");
    assert.ok(t104, "T-104 not found");
    const allIds = plan.tasks.map((t) => t.id);
    const dep = expandDepends(t104!.dependsRaw, allIds);
    assert.equal(dep.mode, "and");
    assert.deepEqual(dep.ids, ["T-101", "T-102", "T-103"]);
    assert.deepEqual(dep.unknown, []);
  }
);

test(
  "T-005 depends expands to T-001..T-004",
  { skip: !planExists },
  () => {
    const plan = parsePlan(readFileSync(PLAN_PATH, "utf8"));
    const t005 = plan.tasks.find((t) => t.id === "T-005");
    assert.ok(t005, "T-005 not found");
    const allIds = plan.tasks.map((t) => t.id);
    const dep = expandDepends(t005!.dependsRaw, allIds);
    assert.equal(dep.mode, "and");
    assert.deepEqual(dep.ids, ["T-001", "T-002", "T-003", "T-004"]);
    assert.deepEqual(dep.unknown, []);
  }
);

test(
  "T-406 is an OR dependency (T-404 or T-405)",
  { skip: !planExists },
  () => {
    const plan = parsePlan(readFileSync(PLAN_PATH, "utf8"));
    const t406 = plan.tasks.find((t) => t.id === "T-406");
    assert.ok(t406, "T-406 not found");
    const allIds = plan.tasks.map((t) => t.id);
    const dep = expandDepends(t406!.dependsRaw, allIds);
    assert.equal(dep.mode, "or");
    assert.deepEqual(dep.ids, ["T-404", "T-405"]);
  }
);

test(
  "T-606 has all four lanes (Owner: All)",
  { skip: !planExists },
  () => {
    const plan = parsePlan(readFileSync(PLAN_PATH, "utf8"));
    const t606 = plan.tasks.find((t) => t.id === "T-606");
    assert.ok(t606, "T-606 not found");
    assert.equal(t606!.ownerRaw, "All");
  }
);

test(
  "M7 tasks all carry the stretch flag",
  { skip: !planExists },
  () => {
    const plan = parsePlan(readFileSync(PLAN_PATH, "utf8"));
    const m7Tasks = plan.tasks.filter((t) => t.milestoneKey === "M7");
    assert.ok(m7Tasks.length > 0, "expected some M7 tasks");
    for (const t of m7Tasks) {
      assert.equal(t.stretch, true, `${t.id} should be stretch`);
    }
  }
);

test("expandDepends: em dash / none", () => {
  const dep = expandDepends("—", ["T-001"]);
  assert.equal(dep.mode, "and");
  assert.deepEqual(dep.ids, []);
});

test("expandDepends: comma list", () => {
  const dep = expandDepends("T-011, T-012", ["T-011", "T-012", "T-013"]);
  assert.equal(dep.mode, "and");
  assert.deepEqual(dep.ids, ["T-011", "T-012"]);
});

test("expandDepends: unknown id reported as anomaly", () => {
  const dep = expandDepends("T-999", ["T-001"]);
  assert.deepEqual(dep.ids, []);
  assert.deepEqual(dep.unknown, ["T-999"]);
});
