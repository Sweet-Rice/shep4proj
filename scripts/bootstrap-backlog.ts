#!/usr/bin/env node
/**
 * bootstrap-backlog.ts
 *
 * Turns the markdown project plan (see ../shep4proj.wiki/Project-Plan.md) into
 * GitHub labels, milestones, story issues, and task sub-issues.
 *
 * Run with Node 24's native TypeScript stripping:
 *   node scripts/bootstrap-backlog.ts --dry-run
 *   node scripts/bootstrap-backlog.ts
 *
 * No npm dependencies. Talks to GitHub exclusively through the `gh` CLI via
 * child_process.execFileSync (argv arrays, never a shell string).
 *
 * Written using only erasable TypeScript syntax (no enums, no namespaces, no
 * parameter properties) so `node --experimental-strip-types` (the default in
 * Node 24) can run it directly.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Milestone {
  key: string; // "M0".."M7"
  number: number; // 0..7
  name: string; // text after the em dash, e.g. "Foundations"
  title: string; // "M0 Foundations"
  body: string; // first paragraph under the heading, or ""
}

interface Story {
  id: string; // "US-00"
  rawTitle: string; // text after "US-XX: "
  title: string; // "US-00 <rawTitle>"
  milestoneKey: string; // "M0"
  stretch: boolean;
  cardSection: string; // markdown from just after the heading up to (not incl.) the task table
}

interface PlanTask {
  id: string; // "T-001"
  taskText: string; // the Task column, verbatim
  title: string; // "T-001 <taskText>"
  ownerRaw: string; // "A" | "B" | "C" | "D" | "All"
  est: string; // hours, verbatim (e.g. "2" or "3 each")
  dependsRaw: string; // verbatim Depends column ("—" if none)
  doneWhen: string; // Done when column
  storyId: string; // "US-00"
  milestoneKey: string; // "M0"
  stretch: boolean; // M7 or parent story stretch
}

interface ParsedPlan {
  milestones: Milestone[];
  stories: Story[];
  tasks: PlanTask[];
}

interface DependsResult {
  mode: "and" | "or";
  ids: string[];
  unknown: string[]; // referenced IDs that don't exist in the plan (anomalies)
}

interface TeamMap {
  [role: string]: string;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const LANES = ["A", "B", "C", "D"];
const ALL_LABELS = [
  "story",
  "task",
  "bug",
  "spike",
  "stretch",
  "scraper-broken",
  "lane:A",
  "lane:B",
  "lane:C",
  "lane:D",
];

/** Convert [[Wiki Page]] links to https://github.com/<repo>/wiki/Wiki-Page links. */
export function convertWikiLinks(text: string, repo: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, (_match, pageRaw: string) => {
    const page = pageRaw.trim();
    // GitHub wiki URLs use the page name with spaces replaced by hyphens.
    const slug = page.replace(/\s+/g, "-");
    return `[${page}](https://github.com/${repo}/wiki/${slug})`;
  });
}

/**
 * Strip [[Wiki Page]] syntax down to plain "Wiki Page" text. Issue titles
 * carry no markdown links (GitHub renders titles as plain text), so wiki
 * references there are just the page name -- unlike issue bodies, which get
 * a real link via convertWikiLinks.
 */
export function stripWikiLinksForTitle(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, (_match, pageRaw: string) => pageRaw.trim());
}

/**
 * Parse the "User stories and tasks" section of the plan markdown.
 * Only milestones M0-M7 under that section are considered.
 */
export function parsePlan(markdown: string): ParsedPlan {
  const lines = markdown.split(/\r?\n/);

  // Find the start of the "## User stories and tasks" section.
  const sectionStart = lines.findIndex((l) =>
    /^##\s+User stories and tasks/.test(l)
  );
  if (sectionStart === -1) {
    throw new Error('Could not find "## User stories and tasks" section in plan');
  }
  const sectionLines = lines.slice(sectionStart);

  const milestones: Milestone[] = [];
  const stories: Story[] = [];
  const tasks: PlanTask[] = [];

  let currentMilestone: Milestone | null = null;
  let currentStory: Story | null = null;
  let storyBodyLines: string[] = [];
  let inTaskTable = false;
  let collectingMilestoneBody = false;
  let milestoneBodyLines: string[] = [];

  const flushStory = () => {
    if (currentStory) {
      currentStory.cardSection = storyBodyLines.join("\n").trim();
      stories.push(currentStory);
    }
    currentStory = null;
    storyBodyLines = [];
    inTaskTable = false;
  };

  const flushMilestoneBody = () => {
    if (currentMilestone && collectingMilestoneBody) {
      // First paragraph = lines up to the first blank line.
      const paragraphLines: string[] = [];
      for (const l of milestoneBodyLines) {
        if (l.trim() === "") {
          if (paragraphLines.length > 0) break;
          continue;
        }
        // Stop if we hit another heading or a story heading.
        if (/^#{2,4}\s/.test(l)) break;
        paragraphLines.push(l);
      }
      currentMilestone.body = paragraphLines.join(" ").trim();
    }
    collectingMilestoneBody = false;
    milestoneBodyLines = [];
  };

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i]!;

    const milestoneMatch = /^###\s+(M[0-7])\s+—\s+(.+)$/.exec(line);
    if (milestoneMatch) {
      flushStory();
      flushMilestoneBody();
      const key = milestoneMatch[1]!;
      const name = milestoneMatch[2]!.trim();
      currentMilestone = {
        key,
        number: Number(key.slice(1)),
        name,
        title: `${key} ${stripWikiLinksForTitle(name)}`,
        body: "",
      };
      milestones.push(currentMilestone);
      collectingMilestoneBody = true;
      continue;
    }

    const storyMatch = /^####\s+(US-\d{2}):\s+(.+)$/.exec(line);
    if (storyMatch) {
      flushStory();
      flushMilestoneBody(); // milestone body ends at first story heading
      const id = storyMatch[1]!;
      const rawTitle = storyMatch[2]!.trim();
      const stretch = /\(stretch\)/i.test(rawTitle) || currentMilestone?.key === "M7";
      currentStory = {
        id,
        rawTitle,
        title: `${id} ${stripWikiLinksForTitle(rawTitle)}`,
        milestoneKey: currentMilestone ? currentMilestone.key : "",
        stretch: Boolean(stretch),
        cardSection: "",
      };
      continue;
    }

    // Task table row.
    const taskMatch = /^\|\s*(T-\d{3})\s*\|(.*)\|(.*)\|(.*)\|(.*)\|(.*)\|\s*$/.exec(
      line
    );
    if (taskMatch && currentStory) {
      const id = taskMatch[1]!;
      const taskText = taskMatch[2]!.trim();
      const ownerRaw = taskMatch[3]!.trim();
      const est = taskMatch[4]!.trim();
      const dependsRaw = taskMatch[5]!.trim();
      const doneWhen = taskMatch[6]!.trim();
      tasks.push({
        id,
        taskText,
        title: `${id} ${stripWikiLinksForTitle(taskText)}`,
        ownerRaw,
        est,
        dependsRaw,
        doneWhen,
        storyId: currentStory.id,
        milestoneKey: currentStory.milestoneKey,
        stretch: currentStory.stretch || currentStory.milestoneKey === "M7",
      });
      continue;
    }

    // Table header / separator rows, or anything else: if we're inside a
    // story and haven't hit the task table yet, accumulate as story body.
    // Once the task table starts, everything up to the next heading
    // (including the closing "---" rule) is excluded from the body.
    if (currentStory) {
      const isTableHeader = /^\|\s*ID\s*\|/.test(line);
      const isTableSeparator = /^\|\s*-+\s*\|/.test(line);
      if (isTableHeader) {
        inTaskTable = true;
        continue;
      }
      if (!inTaskTable && !isTableSeparator) {
        storyBodyLines.push(line);
      }
    } else if (collectingMilestoneBody) {
      milestoneBodyLines.push(line);
    }
  }

  flushStory();
  flushMilestoneBody();

  return { milestones, stories, tasks };
}

/**
 * Expand a Depends column into concrete task IDs.
 *
 * Handles:
 *  - "—" (em dash): no dependencies
 *  - comma lists: "T-011, T-012"
 *  - en-dash ranges: "T-001–T-004" (expanded across IDs that actually exist
 *    in `allTaskIds`, sharing the numeric prefix digit-count of the range)
 *  - "T-404 or T-405": an OR dependency (rendered specially by the caller)
 */
export function expandDepends(
  dependsRaw: string,
  allTaskIds: string[]
): DependsResult {
  const text = dependsRaw.trim();
  const known = new Set(allTaskIds);
  const unknown: string[] = [];

  if (text === "" || text === "—" || text === "-") {
    return { mode: "and", ids: [], unknown: [] };
  }

  // OR form: "T-404 or T-405" (also tolerate multiple: "T-1 or T-2 or T-3").
  if (/\bor\b/i.test(text)) {
    const ids = text
      .split(/\s+or\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const id of ids) {
      if (!known.has(id)) unknown.push(id);
    }
    return { mode: "or", ids, unknown };
  }

  // Comma-separated list, each entry possibly a single ID (ranges are not
  // combined with commas in this plan, but handle it defensively anyway).
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  const resultIds: string[] = [];

  for (const part of parts) {
    const rangeMatch = /^(T-\d+)\s*[–-]\s*(T-\d+)$/.exec(part);
    if (rangeMatch) {
      const startId = rangeMatch[1]!;
      const endId = rangeMatch[2]!;
      const startNum = Number(startId.slice(2));
      const endNum = Number(endId.slice(2));
      const prefixLen = startId.slice(2).length;
      let matchedAny = false;
      for (let n = startNum; n <= endNum; n++) {
        const candidate = `T-${String(n).padStart(prefixLen, "0")}`;
        if (known.has(candidate)) {
          resultIds.push(candidate);
          matchedAny = true;
        }
      }
      if (!matchedAny) {
        unknown.push(part);
      }
    } else if (/^T-\d+$/.test(part)) {
      if (known.has(part)) {
        resultIds.push(part);
      } else {
        unknown.push(part);
      }
    } else if (part.length > 0) {
      // Unrecognized depends text -- surface it as an anomaly.
      unknown.push(part);
    }
  }

  return { mode: "and", ids: resultIds, unknown };
}

// ---------------------------------------------------------------------------
// Body builders
// ---------------------------------------------------------------------------

const PROVISIONAL_MARKER = "<!-- depends: pending issue numbers -->";

function storyFooter(repo: string): string {
  return `Source: [[Project-Plan]] on the wiki`
    .replace(
      "[[Project-Plan]]",
      `[Project-Plan](https://github.com/${repo}/wiki/Project-Plan)`
    );
}

export function buildStoryBody(story: Story, repo: string): string {
  const converted = convertWikiLinks(story.cardSection, repo);
  return `${converted}\n\n---\n\n${storyFooter(repo)}\n`;
}

/**
 * Build a task's issue body. `dependsLines` is either the provisional marker
 * (pass 1, numbers not known yet) or the final rendered "Blocked by #N" lines
 * (pass 2).
 */
export function buildTaskBody(
  task: PlanTask,
  story: Story | undefined,
  milestone: Milestone | undefined,
  repo: string,
  dependsLines: string
): string {
  const lines: string[] = [];
  lines.push(convertWikiLinks(task.taskText, repo));
  lines.push("");
  lines.push(`**Estimate:** ${task.est}h`);
  lines.push("");
  lines.push(`**Depends:** ${dependsLines}`);
  lines.push("");
  lines.push(`**Done when:** ${convertWikiLinks(task.doneWhen, repo)}`);
  lines.push("");
  if (story) {
    lines.push(`**Story:** ${story.title}`);
  }
  if (milestone) {
    lines.push(`**Milestone:** ${milestone.title}`);
  }
  return lines.join("\n") + "\n";
}

function renderDependsText(
  dep: DependsResult,
  taskIdToIssueNumber: Map<string, number>
): string {
  if (dep.ids.length === 0) {
    return "None";
  }
  const numbered = dep.ids.map((id) => {
    const num = taskIdToIssueNumber.get(id);
    return num ? `#${num}` : `${id} (not yet created)`;
  });
  if (dep.mode === "or") {
    return `Blocked by ${numbered.join(" **or** ")}`;
  }
  return numbered.map((n) => `Blocked by ${n}`).join(", ");
}

function provisionalDependsText(dep: DependsResult): string {
  if (dep.ids.length === 0) return "None";
  const label = dep.mode === "or" ? dep.ids.join(" or ") : dep.ids.join(", ");
  return `${label} ${PROVISIONAL_MARKER}`;
}

// ---------------------------------------------------------------------------
// gh CLI wrappers
// ---------------------------------------------------------------------------

function ghRaw(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function ghJson<T>(args: string[]): T {
  const out = ghRaw(args);
  return JSON.parse(out) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// GitHub data shapes (subset of fields we use)
// ---------------------------------------------------------------------------

interface GhLabel {
  name: string;
}

interface GhMilestone {
  number: number;
  title: string;
  state: string;
}

interface GhIssue {
  number: number;
  title: string;
  state: string;
  body: string | null;
  pull_request?: unknown;
  labels: Array<{ name: string } | string>;
  assignees: Array<{ login: string }>;
  milestone: { number: number; title: string } | null;
}

interface GhSubIssue {
  number: number;
  id: number; // numeric issue id (not the same as `number`)
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface Args {
  plan: string;
  team: string;
  repo: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  let plan = "../shep4proj.wiki/Project-Plan.md";
  let team = "team.json";
  let repo: string | null = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--plan") {
      plan = argv[++i] ?? plan;
    } else if (arg === "--team") {
      team = argv[++i] ?? team;
    } else if (arg === "--repo") {
      repo = argv[++i] ?? null;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }
  return { plan, team, repo, dryRun };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, ".."); // scripts/ is one level under repo root

function idOf(title: string): string {
  return title.split(/\s+/)[0] ?? "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const planPath = resolve(REPO_ROOT, args.plan);
  const teamPath = resolve(REPO_ROOT, args.team);

  if (!existsSync(planPath)) {
    console.error(`Plan file not found: ${planPath}`);
    process.exit(1);
  }

  const planText = readFileSync(planPath, "utf8");

  let team: TeamMap;
  if (existsSync(teamPath)) {
    team = JSON.parse(readFileSync(teamPath, "utf8")) as TeamMap;
  } else {
    team = { A: "Sweet-Rice", B: "isaachumphries", C: "JaKyran", D: "TheMrBo" };
    console.log(`(team file not found at ${teamPath}, using built-in default)`);
  }

  let repo = args.repo;
  if (!repo) {
    const info = ghJson<{ nameWithOwner: string }>([
      "repo",
      "view",
      "--json",
      "nameWithOwner",
    ]);
    repo = info.nameWithOwner;
  }

  console.log(`Repo: ${repo}`);
  console.log(`Plan: ${planPath}`);

  const plan = parsePlan(planText);
  console.log(
    `Parsed ${plan.milestones.length} milestones, ${plan.stories.length} stories, ${plan.tasks.length} tasks.`
  );

  const allTaskIds = plan.tasks.map((t) => t.id);
  const storiesById = new Map(plan.stories.map((s) => [s.id, s]));
  const milestonesByKey = new Map(plan.milestones.map((m) => [m.key, m]));

  // Compute dependency expansions up front (also collects anomalies).
  const dependsByTaskId = new Map<string, DependsResult>();
  const anomalies: string[] = [];
  for (const task of plan.tasks) {
    const dep = expandDepends(task.dependsRaw, allTaskIds);
    dependsByTaskId.set(task.id, dep);
    if (dep.unknown.length > 0) {
      anomalies.push(
        `${task.id}: Depends "${task.dependsRaw}" references unknown/unparsed id(s): ${dep.unknown.join(", ")}`
      );
    }
  }

  function ownersToHandles(ownerRaw: string): string[] {
    if (ownerRaw === "All") {
      return LANES.map((l) => team[l]).filter((h): h is string => Boolean(h));
    }
    const handle = team[ownerRaw];
    return handle ? [handle] : [];
  }

  function laneLabelsFor(ownerRaw: string): string[] {
    if (ownerRaw === "All") return LANES.map((l) => `lane:${l}`);
    if (LANES.includes(ownerRaw)) return [`lane:${ownerRaw}`];
    return [];
  }

  // -------------------------------------------------------------------------
  // Fetch existing GitHub state (read-only, safe in dry-run too).
  // -------------------------------------------------------------------------

  console.log("Fetching existing labels...");
  const existingLabels = ghJson<GhLabel[]>([
    "api",
    `repos/${repo}/labels`,
    "--paginate",
  ]);
  const existingLabelNames = new Set(existingLabels.map((l) => l.name));

  console.log("Fetching existing milestones...");
  const existingMilestones = ghJson<GhMilestone[]>([
    "api",
    `repos/${repo}/milestones?state=all`,
    "--paginate",
  ]);
  const milestoneNumberByTitle = new Map(
    existingMilestones.map((m) => [m.title, m.number])
  );

  console.log("Fetching existing issues (this can take a moment)...");
  const existingIssuesRaw = ghJson<GhIssue[]>([
    "api",
    `repos/${repo}/issues?state=all&per_page=100`,
    "--paginate",
  ]);
  const existingIssues = existingIssuesRaw.filter((i) => !i.pull_request);
  const issueByIdPrefix = new Map<string, GhIssue>();
  for (const issue of existingIssues) {
    const id = idOf(issue.title);
    if (/^US-\d{2}$/.test(id) || /^T-\d{3}$/.test(id)) {
      issueByIdPrefix.set(id, issue);
    }
  }

  // -------------------------------------------------------------------------
  // Dry run: report-only.
  // -------------------------------------------------------------------------

  if (args.dryRun) {
    const labelsToCreate = ALL_LABELS.filter((l) => !existingLabelNames.has(l));
    const labelsExisting = ALL_LABELS.filter((l) => existingLabelNames.has(l));

    const milestonesToCreate = plan.milestones.filter(
      (m) => !milestoneNumberByTitle.has(m.title)
    );
    const milestonesExisting = plan.milestones.filter((m) =>
      milestoneNumberByTitle.has(m.title)
    );

    const storiesToCreate = plan.stories.filter((s) => !issueByIdPrefix.has(s.id));
    const storiesExisting = plan.stories.filter((s) => issueByIdPrefix.has(s.id));

    const tasksToCreate = plan.tasks.filter((t) => !issueByIdPrefix.has(t.id));
    const tasksExisting = plan.tasks.filter((t) => issueByIdPrefix.has(t.id));

    console.log("\n=== DRY RUN SUMMARY ===");
    console.log(
      `Labels: ${labelsToCreate.length} to create, ${labelsExisting.length} already exist (total ${ALL_LABELS.length})`
    );
    console.log(
      `Milestones: ${milestonesToCreate.length} to create, ${milestonesExisting.length} already exist (total ${plan.milestones.length})`
    );
    console.log(
      `Stories: ${storiesToCreate.length} to create, ${storiesExisting.length} already exist (total ${plan.stories.length})`
    );
    console.log(
      `Tasks: ${tasksToCreate.length} to create, ${tasksExisting.length} already exist (total ${plan.tasks.length})`
    );

    if (anomalies.length > 0) {
      console.log(`\n=== PARSE ANOMALIES (${anomalies.length}) ===`);
      for (const a of anomalies) console.log(`  - ${a}`);
    } else {
      console.log("\nNo parse anomalies detected.");
    }

    console.log("\n=== LABELS ===");
    for (const l of ALL_LABELS) {
      console.log(`  ${l}${existingLabelNames.has(l) ? " (exists)" : " (create)"}`);
    }

    console.log("\n=== MILESTONES ===");
    for (const m of plan.milestones) {
      console.log(
        `  ${m.title}${milestoneNumberByTitle.has(m.title) ? " (exists)" : " (create)"}`
      );
    }

    console.log("\n=== ISSUES (title | milestone | labels | assignees | depends) ===");
    for (const s of plan.stories) {
      const labels = ["story", ...(s.stretch ? ["stretch"] : [])];
      console.log(
        `  [story] ${s.title} | ${s.milestoneKey} | ${labels.join(",")} | (none) | (none)${
          issueByIdPrefix.has(s.id) ? "  [exists as #" + issueByIdPrefix.get(s.id)!.number + "]" : ""
        }`
      );
    }
    for (const t of plan.tasks) {
      const dep = dependsByTaskId.get(t.id)!;
      const labels = [
        "task",
        ...laneLabelsFor(t.ownerRaw),
        ...(t.stretch ? ["stretch"] : []),
      ];
      const assignees = ownersToHandles(t.ownerRaw);
      const dependsText =
        dep.ids.length === 0
          ? "none"
          : dep.mode === "or"
          ? dep.ids.join(" or ")
          : dep.ids.join(", ");
      console.log(
        `  [task]  ${t.title} | ${t.milestoneKey} | ${labels.join(",")} | ${assignees.join(
          ","
        )} | ${dependsText}${
          issueByIdPrefix.has(t.id) ? "  [exists as #" + issueByIdPrefix.get(t.id)!.number + "]" : ""
        }`
      );
    }

    console.log("\n=== SAMPLE STORY BODIES ===");
    const sampleStoryIds = ["US-00", "US-10"];
    for (const id of sampleStoryIds) {
      const s = storiesById.get(id);
      if (!s) continue;
      console.log(`\n--- ${s.title} ---`);
      console.log(buildStoryBody(s, repo));
    }

    console.log("\n=== SAMPLE TASK BODIES ===");
    const sampleTaskIds = ["T-005", "T-104", "T-406"];
    for (const id of sampleTaskIds) {
      const t = plan.tasks.find((x) => x.id === id);
      if (!t) continue;
      const dep = dependsByTaskId.get(t.id)!;
      const story = storiesById.get(t.storyId);
      const milestone = milestonesByKey.get(t.milestoneKey);
      const dependsText =
        dep.ids.length === 0
          ? "None"
          : dep.mode === "or"
          ? `Blocked by ${dep.ids.join(" **or** ")} (issue numbers not resolved in dry-run)`
          : dep.ids.map((i) => `Blocked by ${i}`).join(", ") +
            " (issue numbers not resolved in dry-run)";
      console.log(`\n--- ${t.title} ---`);
      console.log(buildTaskBody(t, story, milestone, repo, dependsText));
    }

    console.log("\nDry run complete. No mutating calls were made.");
    return;
  }

  // -------------------------------------------------------------------------
  // Real run.
  // -------------------------------------------------------------------------

  // 1. Labels.
  for (const label of ALL_LABELS) {
    console.log(`Ensuring label: ${label}`);
    execFileSync("gh", ["label", "create", label, "--force", "-R", repo], {
      stdio: "inherit",
    });
    await sleep(300);
  }

  // 2. Milestones.
  for (const m of plan.milestones) {
    if (milestoneNumberByTitle.has(m.title)) {
      console.log(`Milestone exists: ${m.title} (#${milestoneNumberByTitle.get(m.title)})`);
      continue;
    }
    console.log(`Creating milestone: ${m.title}`);
    const payload = JSON.stringify({ title: m.title, description: m.body });
    const created = ghJsonWithInput<GhMilestone>(
      ["api", `repos/${repo}/milestones`, "--input", "-"],
      payload
    );
    milestoneNumberByTitle.set(m.title, created.number);
    await sleep(1000);
  }

  // 3. Pass 1: stories, then tasks (provisional depends text).
  const storyNumberById = new Map<string, number>();
  const createdStoryIds = new Set<string>();
  for (const s of plan.stories) {
    const existing = issueByIdPrefix.get(s.id);
    if (existing) {
      console.log(`Story exists: ${s.title} (#${existing.number})`);
      storyNumberById.set(s.id, existing.number);
      continue;
    }
    console.log(`Creating story: ${s.title}`);
    const labels = ["story", ...(s.stretch ? ["stretch"] : [])];
    const milestoneNumber = milestoneNumberByTitle.get(
      milestonesByKey.get(s.milestoneKey)?.title ?? ""
    );
    const body = buildStoryBody(s, repo);
    const payload: Record<string, unknown> = { title: s.title, body, labels };
    if (milestoneNumber) payload.milestone = milestoneNumber;
    const created = ghJsonWithInput<GhIssue>(
      ["api", `repos/${repo}/issues`, "--input", "-"],
      JSON.stringify(payload)
    );
    storyNumberById.set(s.id, created.number);
    createdStoryIds.add(s.id);
    await sleep(1000);
  }

  const taskNumberById = new Map<string, number>();
  const taskIssueIdById = new Map<string, number>(); // numeric `id` field, for sub_issue_id
  const createdTaskIds = new Set<string>();
  for (const t of plan.tasks) {
    const existing = issueByIdPrefix.get(t.id);
    if (existing) {
      console.log(`Task exists: ${t.title} (#${existing.number})`);
      taskNumberById.set(t.id, existing.number);
      // We still need the numeric id for sub-issue linking; fetch lazily below.
      continue;
    }
    console.log(`Creating task: ${t.title}`);
    const dep = dependsByTaskId.get(t.id)!;
    const story = storiesById.get(t.storyId);
    const milestone = milestonesByKey.get(t.milestoneKey);
    const provisionalBody = buildTaskBody(
      t,
      story,
      milestone,
      repo,
      provisionalDependsText(dep)
    );
    const labels = [
      "task",
      ...laneLabelsFor(t.ownerRaw),
      ...(t.stretch ? ["stretch"] : []),
    ];
    const assignees = ownersToHandles(t.ownerRaw);
    const milestoneNumber = milestoneNumberByTitle.get(milestone?.title ?? "");

    const basePayload: Record<string, unknown> = {
      title: t.title,
      body: provisionalBody,
      labels,
    };
    if (milestoneNumber) basePayload.milestone = milestoneNumber;

    let created: GhIssue;
    try {
      created = ghJsonWithInput<GhIssue>(
        ["api", `repos/${repo}/issues`, "--input", "-"],
        JSON.stringify({ ...basePayload, assignees })
      );
    } catch (err) {
      console.warn(
        `  Warning: creating with assignees [${assignees.join(", ")}] failed, retrying without assignees. (${
          (err as Error).message
        })`
      );
      created = ghJsonWithInput<GhIssue>(
        ["api", `repos/${repo}/issues`, "--input", "-"],
        JSON.stringify(basePayload)
      );
    }
    taskNumberById.set(t.id, created.number);
    taskIssueIdById.set(t.id, (created as unknown as { id: number }).id);
    createdTaskIds.add(t.id);
    await sleep(1000);
  }

  // Backfill numeric issue `id` for any pre-existing tasks (needed for
  // sub-issue linking) and pre-existing story bodies (to check the
  // provisional marker for pass 2).
  for (const t of plan.tasks) {
    if (taskIssueIdById.has(t.id)) continue;
    const existing = issueByIdPrefix.get(t.id);
    if (!existing) continue;
    taskIssueIdById.set(t.id, (existing as unknown as { id: number }).id);
  }

  // 4. Pass 2: rewrite task bodies with resolved "Blocked by #N" lines, for
  //    tasks we created this run, or whose body still has the provisional
  //    marker.
  for (const t of plan.tasks) {
    const number = taskNumberById.get(t.id);
    if (!number) continue;
    const existing = issueByIdPrefix.get(t.id);
    const needsUpdate =
      createdTaskIds.has(t.id) ||
      (existing?.body ?? "").includes(PROVISIONAL_MARKER);
    if (!needsUpdate) continue;

    const dep = dependsByTaskId.get(t.id)!;
    const dependsText = renderDependsText(dep, taskNumberById);
    const story = storiesById.get(t.storyId);
    const milestone = milestonesByKey.get(t.milestoneKey);
    const finalBody = buildTaskBody(t, story, milestone, repo, dependsText);

    console.log(`Updating depends text for ${t.title} (#${number})`);
    execFileSync(
      "gh",
      ["api", "-X", "PATCH", `repos/${repo}/issues/${number}`, "--input", "-"],
      { input: JSON.stringify({ body: finalBody }), encoding: "utf8" }
    );
    await sleep(1000);
  }

  // 5. Sub-issue linking: attach each task to its parent story.
  for (const s of plan.stories) {
    const storyNumber = storyNumberById.get(s.id);
    if (!storyNumber) continue;
    const storyTasks = plan.tasks.filter((t) => t.storyId === s.id);
    if (storyTasks.length === 0) continue;

    let existingSubIssues: GhSubIssue[] = [];
    try {
      existingSubIssues = ghJson<GhSubIssue[]>([
        "api",
        `repos/${repo}/issues/${storyNumber}/sub_issues`,
        "--paginate",
      ]);
    } catch {
      existingSubIssues = [];
    }
    const linkedNumbers = new Set(existingSubIssues.map((si) => si.number));

    for (const t of storyTasks) {
      const taskNumber = taskNumberById.get(t.id);
      const taskIssueId = taskIssueIdById.get(t.id);
      if (!taskNumber || !taskIssueId) continue;
      if (linkedNumbers.has(taskNumber)) {
        console.log(`Sub-issue already linked: ${t.id} -> ${s.id}`);
        continue;
      }
      console.log(`Linking sub-issue ${t.id} (#${taskNumber}) -> ${s.id} (#${storyNumber})`);
      try {
        execFileSync(
          "gh",
          [
            "api",
            "-X",
            "POST",
            `repos/${repo}/issues/${storyNumber}/sub_issues`,
            "-F",
            `sub_issue_id=${taskIssueId}`,
          ],
          { stdio: "pipe" }
        );
      } catch (err) {
        console.warn(
          `  Warning: sub_issues API failed for ${t.id} -> ${s.id}, falling back to "Part of #" in body. (${
            (err as Error).message
          })`
        );
        const currentBody =
          issueByIdPrefix.get(t.id)?.body ??
          buildTaskBody(
            t,
            storiesById.get(t.storyId),
            milestonesByKey.get(t.milestoneKey),
            repo,
            renderDependsText(dependsByTaskId.get(t.id)!, taskNumberById)
          );
        if (!currentBody.includes(`Part of #${storyNumber}`)) {
          const patchedBody = `${currentBody}\n\nPart of #${storyNumber}\n`;
          execFileSync(
            "gh",
            ["api", "-X", "PATCH", `repos/${repo}/issues/${taskNumber}`, "--input", "-"],
            { input: JSON.stringify({ body: patchedBody }), encoding: "utf8" }
          );
        }
      }
      await sleep(1000);
    }
  }

  if (anomalies.length > 0) {
    console.log(`\n=== PARSE ANOMALIES (${anomalies.length}) ===`);
    for (const a of anomalies) console.log(`  - ${a}`);
  }

  console.log("\nDone.");
}

function ghJsonWithInput<T>(args: string[], input: string): T {
  const out = execFileSync("gh", args, {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out) as T;
}

// Only run main() when executed directly (not when imported for tests).
const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
