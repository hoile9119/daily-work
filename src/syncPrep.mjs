import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { parseWorklog } from "./parser.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

// 1. Parse CLI args: --date YYYY-MM-DD (optional), positional filepath (optional)
const args = process.argv.slice(2);
let dateOverride = null;
let filePath = resolve(projectRoot, "today.md");

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--date" && args[i + 1]) {
    dateOverride = args[++i];
  } else if (!args[i].startsWith("-")) {
    filePath = resolve(args[i]);
  }
}

// 2. Read today.md
let markdownText;
try {
  markdownText = readFileSync(filePath, "utf8");
} catch (err) {
  process.stderr.write(`syncPrep: cannot read '${filePath}': ${err.message}\n`);
  process.exit(1);
}

// 3. Read .planning/state.json
let state;
try {
  const statePath = resolve(projectRoot, ".planning/state.json");
  state = JSON.parse(readFileSync(statePath, "utf8"));
} catch (err) {
  process.stderr.write(
    `syncPrep: cannot read .planning/state.json: ${err.message}\n` +
    `Run the Notion DB setup skill first.\n`
  );
  process.exit(1);
}

// 4. Parse worklog
const { date, projects, errors } = parseWorklog(markdownText, dateOverride);

// 5. Separate hard errors from warnings
const hardErrors = errors.filter(e => e.severity === "error");
const warnings = errors
  .filter(e => e.severity === "warning")
  .map(e => e.message);

if (hardErrors.length > 0) {
  process.stderr.write(
    `syncPrep: ${hardErrors.length} parse error(s) in '${filePath}':\n` +
    hardErrors
      .map(e => `  Line ${e.line}: ${e.message}\n    → ${e.context}`)
      .join("\n") + "\n"
  );
  process.exit(1);
}

// 6. Flatten tasks (include project reference), exclude projects with no tasks
const validProjects = projects.filter(p => p.tasks.length > 0);

const tasks = validProjects.flatMap(p =>
  p.tasks.map(t => ({
    project: p.name,
    name: t.name,
    status: t.status,
    notes: t.notes,
    line: t.line,
  }))
);

// 7. Build and emit manifest
const manifest = {
  date,
  projectsDsId: state.projectsDsId,
  tasksDsId: state.tasksDsId,
  projectsDbId: state.projectsDbId,
  tasksDbId: state.tasksDbId,
  projects: validProjects.map(p => ({ name: p.name })),
  tasks,
  warnings,
};

process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
