import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseWorklog } from "./parser.mjs";
import { normalizeStatus, suggestStatus } from "./normalizeStatus.mjs";

// ─── Happy Path ───────────────────────────────────────────────────────────────

describe("Happy path", () => {
  test("single project, single task with notes", () => {
    const result = parseWorklog("## Alpha\n- Fix bug | wip\n  Investigated the issue.");
    assert.equal(result.projects[0].name, "Alpha");
    assert.equal(result.projects[0].tasks[0].name, "Fix bug");
    assert.equal(result.projects[0].tasks[0].status, "in progress");
    assert.equal(result.projects[0].tasks[0].rawStatus, "wip");
    assert.ok(result.projects[0].tasks[0].notes.includes("Investigated the issue."));
    assert.equal(result.errors.length, 0);
  });

  test("task with no notes → notes is empty string, not null", () => {
    const result = parseWorklog("## Alpha\n- Deploy | done");
    assert.equal(result.projects[0].tasks[0].notes, "");
    assert.equal(result.errors.length, 0);
  });

  test("multi-project, multi-task", () => {
    const md = [
      "## ProjectA",
      "- Task A1 | done",
      "- Task A2 | new",
      "## ProjectB",
      "- Task B1 | wip",
      "- Task B2 | pending",
      "## ProjectC",
      "- Task C1 | done",
      "- Task C2 | done",
    ].join("\n");
    const result = parseWorklog(md);
    assert.equal(result.projects.length, 3);
    const totalTasks = result.projects.reduce((n, p) => n + p.tasks.length, 0);
    assert.equal(totalTasks, 6);
  });

  test("multi-line notes are concatenated", () => {
    const result = parseWorklog("## P\n- Task | done\n  Line one.\n  Line two.");
    const notes = result.projects[0].tasks[0].notes;
    assert.ok(notes.includes("Line one."), `notes should include 'Line one.' but got: ${notes}`);
    assert.ok(notes.includes("Line two."), `notes should include 'Line two.' but got: ${notes}`);
    assert.equal(result.errors.length, 0);
  });

  test("date override is used when provided", () => {
    const result = parseWorklog("## P\n- T | done", "2025-01-15");
    assert.equal(result.date, "2025-01-15");
  });

  test("date defaults to today YYYY-MM-DD when not provided", () => {
    const result = parseWorklog("## P\n- T | done");
    assert.match(result.date, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("task name with special characters is preserved", () => {
    const result = parseWorklog("## P\n- Fix: login & auth (urgent) | done");
    assert.equal(result.projects[0].tasks[0].name, "Fix: login & auth (urgent)");
  });
});

// ─── Status Normalization ─────────────────────────────────────────────────────

describe("Status normalization", () => {
  const cases = [
    // → in progress
    ["wip", "in progress"],
    ["in-progress", "in progress"],
    ["in_progress", "in progress"],
    ["WIP", "in progress"],
    ["In Progress", "in progress"],
    // → done
    ["done", "done"],
    ["completed", "done"],
    ["finished", "done"],
    ["shipped", "done"],
    ["merged", "done"],
    // → pending
    ["blocked", "pending"],
    ["on hold", "pending"],
    ["on-hold", "pending"],
    ["waiting", "pending"],
    ["paused", "pending"],
    // → new
    ["todo", "new"],
    ["not started", "new"],
    ["open", "new"],
    ["backlog", "new"],
  ];

  for (const [raw, expected] of cases) {
    test(`"${raw}" → "${expected}"`, () => {
      const result = parseWorklog(`## P\n- Task | ${raw}`);
      assert.equal(result.projects[0].tasks[0].status, expected, `status mismatch for raw="${raw}"`);
      assert.equal(result.errors.length, 0);
    });
  }
});

// ─── Error Cases ──────────────────────────────────────────────────────────────

describe("Error cases", () => {
  test("task before any ## heading → error", () => {
    const result = parseWorklog("- Orphan task | done\n\n## Project\n- Real task | done");
    assert.ok(result.errors.some(e => e.severity === "error" && e.message.includes("before any project heading")));
    assert.equal(result.projects[0].tasks.length, 1); // only valid task
  });

  test("missing | separator → error with line number", () => {
    const result = parseWorklog("## Project\n- Task without pipe");
    assert.ok(result.errors.some(e => e.severity === "error" && e.message.includes("missing status separator")));
    assert.ok(result.errors[0].line > 0);
    assert.equal(result.projects[0].tasks.length, 0);
  });

  test("unknown status → error with suggestion", () => {
    const result = parseWorklog("## Project\n- Task | fluxing");
    assert.ok(result.errors.some(e =>
      e.severity === "error" &&
      e.message.includes("Unknown status 'fluxing'") &&
      e.message.includes("Did you mean")
    ));
  });

  test("empty task name (| done with nothing before pipe) → error", () => {
    const result = parseWorklog("## Project\n- | done");
    assert.ok(result.errors.some(e => e.message.includes("no name")));
  });

  test("empty status (Task | with nothing after pipe) → error", () => {
    const result = parseWorklog("## Project\n- Task name |");
    assert.ok(result.errors.some(e => e.message.includes("no status")));
  });

  test("project with no tasks → warning, not error", () => {
    const result = parseWorklog("## Empty Project\n\n## Project With Task\n- Task | done");
    assert.ok(result.errors.some(e => e.severity === "warning" && e.message.includes("Empty Project")));
    const p = result.projects.find(p => p.name === "Project With Task");
    assert.equal(p.tasks.length, 1);
  });

  test("completely empty input → projects: [], errors: []", () => {
    const result = parseWorklog("");
    assert.equal(result.projects.length, 0);
    assert.ok(Array.isArray(result.errors));
  });

  test("whitespace-only input → projects: [], no crash", () => {
    const result = parseWorklog("   \n\n  \n");
    assert.equal(result.projects.length, 0);
  });
});

// ─── normalizeStatus Unit Tests ───────────────────────────────────────────────

describe("normalizeStatus unit tests", () => {
  test("returns null for unknown input", () => {
    assert.equal(normalizeStatus("xyz"), null);
  });

  test("is case-insensitive", () => {
    assert.equal(normalizeStatus("WIP")?.canonical, "in progress");
    assert.equal(normalizeStatus("Done")?.canonical, "done");
    assert.equal(normalizeStatus("BLOCKED")?.canonical, "pending");
  });

  test("preserves rawStatus exactly as passed", () => {
    assert.equal(normalizeStatus("WIP")?.rawStatus, "WIP");
    assert.equal(normalizeStatus("completed")?.rawStatus, "completed");
  });

  test("suggestStatus returns a non-empty string for unknown input", () => {
    const result = suggestStatus("complish");
    assert.equal(typeof result, "string");
    assert.ok(result.length > 0);
  });

  test("suggestStatus handles completion-like words", () => {
    const result = suggestStatus("compl");
    assert.equal(typeof result, "string");
  });

  test("returns null for non-string input", () => {
    assert.equal(normalizeStatus(null), null);
    assert.equal(normalizeStatus(undefined), null);
    assert.equal(normalizeStatus(42), null);
  });
});
