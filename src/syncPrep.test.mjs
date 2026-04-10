import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(__dirname, "..");
const scriptPath = join(__dirname, "syncPrep.mjs");

/** Run syncPrep.mjs with given args, returns { stdout, stderr, status } */
function runSyncPrep(args = [], options = {}) {
  const result = spawnSync("node", [scriptPath, ...args], {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

/** Write a temp markdown file, return its path */
function writeTempMd(content) {
  const dir = mkdtempSync(join(tmpdir(), "syncprep-test-"));
  const path = join(dir, "today.md");
  writeFileSync(path, content, "utf8");
  return path;
}

// ─── Happy Path ───────────────────────────────────────────────────────────────

describe("Happy path", () => {
  const SAMPLE_MD = [
    "## Project Alpha",
    "- Research options | done",
    "  Reviewed three approaches and selected the fastest.",
    "- Deploy service | in progress",
    "## Project Beta",
    "- Write tests | new",
  ].join("\n");

  test("outputs valid JSON with required top-level fields", () => {
    const mdPath = writeTempMd(SAMPLE_MD);
    const { stdout, status } = runSyncPrep([mdPath]);
    assert.equal(status, 0, "should exit 0");
    const manifest = JSON.parse(stdout);
    assert.ok("date" in manifest, "manifest.date missing");
    assert.ok("projectsDsId" in manifest, "manifest.projectsDsId missing");
    assert.ok("tasksDsId" in manifest, "manifest.tasksDsId missing");
    assert.ok("projectsDbId" in manifest, "manifest.projectsDbId missing");
    assert.ok("tasksDbId" in manifest, "manifest.tasksDbId missing");
    assert.ok(Array.isArray(manifest.projects), "manifest.projects not array");
    assert.ok(Array.isArray(manifest.tasks), "manifest.tasks not array");
    assert.ok(Array.isArray(manifest.warnings), "manifest.warnings not array");
  });

  test("projects[] contains both projects", () => {
    const mdPath = writeTempMd(SAMPLE_MD);
    const { stdout, status } = runSyncPrep([mdPath]);
    assert.equal(status, 0);
    const manifest = JSON.parse(stdout);
    assert.equal(manifest.projects.length, 2);
    assert.equal(manifest.projects[0].name, "Project Alpha");
    assert.equal(manifest.projects[1].name, "Project Beta");
  });

  test("tasks[] is flat with project reference", () => {
    const mdPath = writeTempMd(SAMPLE_MD);
    const { stdout, status } = runSyncPrep([mdPath]);
    assert.equal(status, 0);
    const manifest = JSON.parse(stdout);
    assert.equal(manifest.tasks.length, 3);
    assert.equal(manifest.tasks[0].project, "Project Alpha");
    assert.equal(manifest.tasks[0].name, "Research options");
    assert.equal(manifest.tasks[0].status, "done");
    assert.ok(manifest.tasks[0].notes.includes("Reviewed three"));
    assert.equal(manifest.tasks[2].project, "Project Beta");
  });

  test("task with no notes → notes is empty string", () => {
    const mdPath = writeTempMd("## P\n- Task only | new");
    const { stdout, status } = runSyncPrep([mdPath]);
    assert.equal(status, 0);
    const manifest = JSON.parse(stdout);
    assert.equal(manifest.tasks[0].notes, "");
  });

  test("--date YYYY-MM-DD overrides manifest.date", () => {
    const mdPath = writeTempMd("## P\n- Task | done");
    const { stdout, status } = runSyncPrep([mdPath, "--date", "2025-06-15"]);
    assert.equal(status, 0);
    const manifest = JSON.parse(stdout);
    assert.equal(manifest.date, "2025-06-15");
  });

  test("project with no tasks is excluded from projects[] and adds a warning", () => {
    const md = "## Empty Project\n\n## Real Project\n- Task one | done";
    const mdPath = writeTempMd(md);
    const { stdout, status } = runSyncPrep([mdPath]);
    assert.equal(status, 0);
    const manifest = JSON.parse(stdout);
    const projectNames = manifest.projects.map(p => p.name);
    assert.ok(!projectNames.includes("Empty Project"), "empty project should be excluded");
    assert.ok(projectNames.includes("Real Project"));
    assert.ok(manifest.warnings.length > 0, "should have a warning for empty project");
  });

  test("each task entry has required fields: project, name, status, notes, line", () => {
    const mdPath = writeTempMd("## P\n- My Task | wip\n  Some notes.");
    const { stdout } = runSyncPrep([mdPath]);
    const manifest = JSON.parse(stdout);
    const task = manifest.tasks[0];
    assert.ok("project" in task);
    assert.ok("name" in task);
    assert.ok("status" in task);
    assert.ok("notes" in task);
    assert.ok("line" in task);
    assert.equal(task.status, "in progress"); // wip → canonicalized
  });
});

// ─── Error Path ───────────────────────────────────────────────────────────────

describe("Error path", () => {
  test("missing today.md → exit 1, stderr contains path", () => {
    const { stderr, status } = runSyncPrep(["/nonexistent/path/today.md"]);
    assert.equal(status, 1);
    assert.ok(stderr.includes("/nonexistent/path/today.md"), `stderr: ${stderr}`);
  });

  test("invalid status in today.md → exit 1, stderr contains 'Line'", () => {
    const mdPath = writeTempMd("## P\n- Task | unknownstatus");
    const { stderr, status } = runSyncPrep([mdPath]);
    assert.equal(status, 1);
    assert.ok(stderr.includes("Line"), `stderr should mention Line, got: ${stderr}`);
  });

  test("task missing | separator → exit 1", () => {
    const mdPath = writeTempMd("## P\n- Task with no pipe");
    const { stderr, status } = runSyncPrep([mdPath]);
    assert.equal(status, 1);
    assert.ok(stderr.length > 0, "stderr should not be empty");
  });

  test("task before any project heading → exit 1", () => {
    const mdPath = writeTempMd("- Orphan task | done");
    const { stderr, status } = runSyncPrep([mdPath]);
    assert.equal(status, 1);
    assert.ok(stderr.length > 0);
  });

  test("missing state.json → exit 1, stderr mentions Notion DB setup", () => {
    const statePath = join(projectRoot, ".planning", "state.json");
    const backupPath = join(projectRoot, ".planning", "state.json.bak");
    // Temporarily hide state.json so syncPrep cannot find it
    renameSync(statePath, backupPath);
    try {
      const mdPath = writeTempMd("## Project\n- Task | done");
      const { stderr, status } = runSyncPrep([mdPath]);
      assert.equal(status, 1);
      assert.ok(
        stderr.toLowerCase().includes("state.json") || stderr.includes("Notion DB setup"),
        `stderr should mention state.json or Notion DB setup, got: ${stderr}`
      );
    } finally {
      // Always restore state.json
      renameSync(backupPath, statePath);
    }
  });
});
