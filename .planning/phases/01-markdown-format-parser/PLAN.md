# Phase 1 Plan: Markdown Format + Parser

**Phase:** 01-markdown-format-parser  
**Goal:** Users can fill in `today.md` and have it parsed into a structured, validated worklog  
**Requirements:** MDF-01, MDF-02, MDF-03, MDF-04, MDF-05, PRSR-01, PRSR-02, PRSR-03, PRSR-04

**Success Criteria:**

1. `today.template.md` exists at project root and demonstrates the full format (projects, tasks, statuses, notes)
2. `npm install` succeeds — `unified` and `remark-parse` v11 are available
3. `node src/parser.mjs today.md` prints valid JSON matching the `ParsedWorklog` schema
4. 30+ status variants (wip, done, blocked, etc.) normalize to the 4 canonical values
5. Malformed input (missing `|`, unknown status, task before heading) produces clear errors with line numbers
6. All tests pass: `node --test src/parser.test.mjs`

---

## Threat Model

| Concern | Analysis | Disposition |
|---------|----------|-------------|
| Malformed `today.md` causes crash | Parser must never throw unhandled exceptions on user input | Mitigate — all AST traversal wrapped in try/catch; errors go to `errors[]` array, not stderr crash |
| Path traversal via CLI arg | `node src/parser.mjs <filepath>` reads user-supplied path | Accept — personal tool, single user, no untrusted input |
| Notes containing sensitive data | `notes` field stored raw in memory and later sent to AI | Accept for Phase 1 — AI summarization is user-initiated; scope review at Phase 3 |

---

## Wave 0: Setup (run immediately — no dependencies)

### Task 0.1: Initialize npm project with ESM and install parser dependencies

**What:**  
Create `package.json` at project root with `"type": "module"` (ESM), then install `unified@11` and `remark-parse@11` as production dependencies. Also install `unist-util-visit@5` (needed to walk the remark AST). No TypeScript, no build step.

**Files:**
- `/Users/Hoi.LeA1/Developer/daily-work/package.json` (create)
- `/Users/Hoi.LeA1/Developer/daily-work/node_modules/` (populated by npm install)

**Exact commands:**
```bash
cd /Users/Hoi.LeA1/Developer/daily-work
npm init -y
# Then edit package.json to set "type": "module" and "name": "daily-work-summarizer"
npm install unified@11 remark-parse@11 unist-util-visit@5
```

**`package.json` must contain:**
```json
{
  "name": "daily-work-summarizer",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --test src/parser.test.mjs"
  }
}
```

**Acceptance:**
```bash
node -e "import('unified').then(m => console.log('unified ok'))"
node -e "import('remark-parse').then(m => console.log('remark-parse ok'))"
node -e "import('unist-util-visit').then(m => console.log('unist-util-visit ok'))"
```
All three print their `ok` message — no errors.

---

### Task 0.2: Create `today.template.md` at project root

**What:**  
Write a starter template file demonstrating the full format. This is MDF-05. It must show: project headings, tasks with status, tasks with notes, tasks without notes, and a comment block explaining the status values.

**Files:**
- `/Users/Hoi.LeA1/Developer/daily-work/today.template.md` (create)

**Exact content to write:**
```markdown
## Project Name

- Task name here | in progress
  Freeform notes go here — indented 2+ spaces.
  Can span multiple lines. The AI will summarize these.

- Another task | done
  Notes are optional. Tasks without notes are valid.

- Not started yet | new

- Waiting on review | pending
  Blocked on design sign-off.

## Another Project

- First task | wip
  Notes go here.

- Completed work | completed
  Both 'done' and 'completed' are accepted.
```

**Acceptance:**  
File exists at `/Users/Hoi.LeA1/Developer/daily-work/today.template.md` and contains at least: one `##` heading, one `- ... | ...` task line, and one indented note line.

---

## Wave 1: Status Normalizer (no parser dependency — can run in parallel with Wave 0)

### Task 1.1: Implement `src/normalizeStatus.mjs`

**What:**  
Create a pure ESM module that exports `normalizeStatus(raw)`. It accepts a raw status string (case-insensitive) and returns either `{ canonical, rawStatus }` or `null` if the status is unknown. Also export `suggestStatus(raw)` which returns the closest canonical guess (string) for use in error messages.

**Files:**
- `/Users/Hoi.LeA1/Developer/daily-work/src/normalizeStatus.mjs` (create)

**Complete normalization map to implement** (case-insensitive match on trimmed input):

```
new         → "new"
todo        → "new"
to do       → "new"
not started → "new"
open        → "new"
backlog     → "new"

in progress → "in progress"
in-progress → "in progress"
in_progress → "in progress"
inprogress  → "in progress"
wip         → "in progress"
working     → "in progress"
started     → "in progress"
active      → "in progress"
ongoing     → "in progress"
doing       → "in progress"

done        → "done"
complete    → "done"
completed   → "done"
finish      → "done"
finished    → "done"
closed      → "done"
resolved    → "done"
shipped     → "done"
merged      → "done"

pending     → "pending"
blocked     → "pending"
on hold     → "pending"
on-hold     → "pending"
onhold      → "pending"
waiting     → "pending"
paused      → "pending"
deferred    → "pending"
```

**Function signatures:**
```js
// Returns { canonical: "in progress", rawStatus: "wip" } or null if unknown
export function normalizeStatus(raw) { ... }

// Returns best-guess canonical string for error messages, e.g. "in progress"
// Falls back to "new, in progress, done, pending" if no good match
export function suggestStatus(raw) { ... }
```

**`suggestStatus` implementation approach:**
- Check if any canonical's aliases have a word/prefix overlap with the raw string
- Prefix checks: `"prog"` / `"work"` / `"act"` → `"in progress"`; `"compl"` / `"fin"` / `"clos"` / `"ship"` / `"merg"` / `"resolv"` → `"done"`; `"block"` / `"hold"` / `"wait"` / `"paus"` / `"defer"` → `"pending"`; `"todo"` / `"not"` / `"open"` / `"back"` → `"new"`
- If no prefix match: return `"new, in progress, done, or pending"`

**Acceptance:**
```bash
node -e "
import('./src/normalizeStatus.mjs').then(({ normalizeStatus, suggestStatus }) => {
  console.assert(normalizeStatus('wip')?.canonical === 'in progress', 'wip failed');
  console.assert(normalizeStatus('WIP')?.canonical === 'in progress', 'WIP case failed');
  console.assert(normalizeStatus('completed')?.canonical === 'done', 'completed failed');
  console.assert(normalizeStatus('blocked')?.canonical === 'pending', 'blocked failed');
  console.assert(normalizeStatus('todo')?.canonical === 'new', 'todo failed');
  console.assert(normalizeStatus('xyz') === null, 'unknown should return null');
  console.assert(typeof suggestStatus('complish') === 'string', 'suggestStatus failed');
  console.log('normalizeStatus: all assertions passed');
});
"
```

---

## Wave 2: Core Parser (after Wave 0 AND Wave 1 — needs npm packages + normalizeStatus.mjs)

### Task 2.1: Implement `src/parser.mjs` with `parseWorklog(text, date)` using remark-parse AST

**What:**  
The main parsing module. Accepts raw markdown text and an optional date string, returns a `ParsedWorklog` object. Uses `unified` + `remark-parse` to build an AST, then walks it to extract the project → task → notes hierarchy. Imports `normalizeStatus` and `suggestStatus` from `src/normalizeStatus.mjs`.

**Files:**
- `/Users/Hoi.LeA1/Developer/daily-work/src/parser.mjs` (create)

**Exported interface:**
```js
// Primary export — pure function, no side effects
export function parseWorklog(markdownText, dateOverride = null)
// Returns ParsedWorklog:
// {
//   date: string,           // dateOverride or today as "YYYY-MM-DD"
//   projects: Project[],    // may be empty
//   errors: ParseError[]    // always an array, may be empty
// }

// Standalone runner guard (for: node src/parser.mjs today.md)
// At bottom of file:
// if (process.argv[1] === fileURLToPath(import.meta.url)) { ... }
```

**`ParsedWorklog` types (implement as plain JS objects — no TypeScript):**
```
Project  = { name: string, tasks: Task[] }
Task     = { name: string, status: string, rawStatus: string, notes: string, line: number }
ParseError = { line: number, message: string, severity: "error"|"warning", context: string }
```

**AST walking algorithm — implement exactly:**

```js
import { unified } from "unified";
import remarkParse from "remark-parse";
import { fileURLToPath } from "url";
import { normalizeStatus, suggestStatus } from "./normalizeStatus.mjs";

export function parseWorklog(markdownText, dateOverride = null) {
  const date = dateOverride ?? new Date().toISOString().slice(0, 10);
  const tree = unified().use(remarkParse).parse(markdownText);

  const projects = [];
  const errors = [];
  let currentProject = null;

  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 2) {
      const name = extractText(node).trim();
      if (!name) {
        errors.push({
          line: node.position.start.line,
          message: `Empty project heading at line ${node.position.start.line}`,
          severity: "error",
          context: "##"
        });
        currentProject = null;
      } else {
        currentProject = { name, tasks: [] };
        projects.push(currentProject);
      }
    } else if (node.type === "list") {
      for (const item of node.children) {
        parseListItem(item, currentProject, projects, errors);
      }
    }
    // Ignore other node types (paragraphs at top level, thematic breaks, etc.)
  }

  // Warn on projects with no tasks
  for (const project of projects) {
    if (project.tasks.length === 0) {
      errors.push({
        line: 0,
        message: `Project '${project.name}' has no tasks — it will not be synced`,
        severity: "warning",
        context: `## ${project.name}`
      });
    }
  }

  return { date, projects, errors };
}
```

**`parseListItem` helper — implement exactly:**

```js
function parseListItem(item, currentProject, projects, errors) {
  // Get the first paragraph child (the task line itself)
  const firstParagraph = item.children.find(c => c.type === "paragraph");
  if (!firstParagraph) return;

  // For tight lists, the task line and notes are in the SAME paragraph node, separated
  // by a soft break (\n). Split to isolate the task line from inlined notes.
  const fullText = extractText(firstParagraph);
  const lines = fullText.split("\n");
  const taskLine = lines[0];
  const inlinedNotes = lines.slice(1).map(l => l.trim()).filter(Boolean).join("\n");
  const line = firstParagraph.position.start.line;

  // Check: task before any project heading
  if (!currentProject) {
    errors.push({
      line,
      message: `Task at line ${line} appears before any project heading`,
      severity: "error",
      context: `- ${taskLine}`
    });
    return;
  }

  // Check: missing | separator
  if (!taskLine.includes("|")) {
    errors.push({
      line,
      message: `Task at line ${line} is missing status separator (expected '- Task Name | status')`,
      severity: "error",
      context: `- ${taskLine}`
    });
    return;
  }

  // Split on last | to handle task names that contain | (unlikely but defensive)
  const lastPipe = taskLine.lastIndexOf("|");
  const rawName = taskLine.slice(0, lastPipe).trim();
  const rawStatus = taskLine.slice(lastPipe + 1).trim();

  // Check: empty task name
  if (!rawName) {
    errors.push({
      line,
      message: `Task at line ${line} has no name before the '|' separator`,
      severity: "error",
      context: `- ${taskLine}`
    });
    return;
  }

  // Check: empty status
  if (!rawStatus) {
    errors.push({
      line,
      message: `Task at line ${line} has no status after the '|' separator`,
      severity: "error",
      context: `- ${taskLine}`
    });
    return;
  }

  // Normalize status
  const normalized = normalizeStatus(rawStatus);
  if (!normalized) {
    const suggestion = suggestStatus(rawStatus);
    errors.push({
      line,
      message: `Unknown status '${rawStatus}' at line ${line}. Did you mean: '${suggestion}'?`,
      severity: "error",
      context: `- ${taskLine}`
    });
    return;
  }

  // Collect notes from two sources:
  // 1. Inlined notes: lines after the first line in the task paragraph (tight lists)
  // 2. Extra paragraph children after the first paragraph (loose lists — blank-line separated)
  const noteParagraphs = item.children
    .filter(c => c.type === "paragraph")
    .slice(1)
    .map(p => extractText(p));

  // Merge: loose-list paragraphs first, then inlined tight-list notes
  const notes = [...noteParagraphs, inlinedNotes].filter(Boolean).join("\n\n");

  currentProject.tasks.push({
    name: rawName,
    status: normalized.canonical,
    rawStatus: normalized.rawStatus,
    notes,
    line
  });
}
```

**`extractText` helper — implement exactly:**
```js
// Recursively extract plain text from any remark AST node
// Returns "\n" for soft-break nodes so tight-list notes are preserved as newlines
function extractText(node) {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  if (node.type === "break") return "\n";
  if (node.type === "strong" || node.type === "emphasis" || node.type === "link") {
    return (node.children ?? []).map(extractText).join("");
  }
  if (node.children) return node.children.map(extractText).join("");
  return "";
}
```

**Standalone CLI runner — add at bottom of file:**
```js
// Allow: node src/parser.mjs [filepath]
// Prints ParsedWorklog JSON to stdout; errors to stderr
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { readFileSync } = await import("fs");
  const filepath = process.argv[2] ?? "today.md";
  try {
    const text = readFileSync(filepath, "utf8");
    const result = parseWorklog(text);
    if (result.errors.length > 0) {
      const errs = result.errors.filter(e => e.severity === "error");
      const warns = result.errors.filter(e => e.severity === "warning");
      if (warns.length > 0) process.stderr.write(`⚠  ${warns.length} warning(s):\n${warns.map(w => `  ${w.message}`).join("\n")}\n`);
      if (errs.length > 0) process.stderr.write(`✗  ${errs.length} error(s):\n${errs.map(e => `  Line ${e.line}: ${e.message}\n          → ${e.context}`).join("\n")}\n`);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    process.stderr.write(`Cannot read file '${filepath}': ${err.message}\n`);
    process.exit(1);
  }
}
```

**Acceptance:**
```bash
node --input-type=module <<'EOF'
import { parseWorklog } from './src/parser.mjs';
import { readFileSync } from 'fs';
const text = readFileSync('./today.template.md', 'utf8');
const result = parseWorklog(text, '2025-01-15');
console.log(JSON.stringify(result, null, 2));
if (result.errors.length > 0) { console.error('Errors:', result.errors); process.exit(1); }
console.log('✓ Parser works');
EOF
```

---

## Wave 3: Tests (after Wave 0 + 1 + 2)

### Task 3.1: Write `src/parser.test.mjs` using Node.js built-in test runner

**What:**  
Comprehensive tests using `node:test` and `node:assert`. No external test framework needed. Tests cover: happy path, status normalization, edge cases, and all error conditions.

**Files:**
- `/Users/Hoi.LeA1/Developer/daily-work/src/parser.test.mjs` (create)

**Test cases to implement (write all of these):**

**Group: Happy path**
```
test: "single project, single task, with notes"
  input: "## Alpha\n- Fix bug | wip\n  Investigated the issue."
  assert: projects[0].name === "Alpha"
  assert: projects[0].tasks[0].name === "Fix bug"
  assert: projects[0].tasks[0].status === "in progress"
  assert: projects[0].tasks[0].rawStatus === "wip"
  assert: projects[0].tasks[0].notes === "Investigated the issue."
  assert: errors.length === 0

test: "task with no notes → notes is empty string, not null"
  input: "## Alpha\n- Deploy | done"
  assert: projects[0].tasks[0].notes === ""
  assert: errors.length === 0

test: "multi-project, multi-task"
  input: three ## sections each with 2 tasks
  assert: projects.length === 3
  assert: total task count across all projects === 6

test: "multi-line notes are concatenated"
  input: "## P\n- Task | done\n  Line one.\n  Line two."
  assert: notes contains both lines (either joined with \n or as one string)
  assert: notes includes "Line one"
  assert: notes includes "Line two"

test: "date override is used when provided"
  input: any valid markdown, dateOverride: "2025-01-15"
  assert: result.date === "2025-01-15"

test: "date defaults to today's YYYY-MM-DD when not provided"
  assert: result.date matches /^\d{4}-\d{2}-\d{2}$/
```

**Group: Status normalization (test via parser, not just normalizeStatus directly)**
```
test each of: "wip", "in-progress", "in_progress", "WIP", "In Progress"  → status: "in progress"
test each of: "done", "completed", "finished", "shipped", "merged"        → status: "done"
test each of: "blocked", "on hold", "on-hold", "waiting", "paused"       → status: "pending"
test each of: "todo", "not started", "open", "backlog"                   → status: "new"
```

**Group: Error cases**
```
test: "task before any ## heading"
  input: "- Orphan task | done\n\n## Project\n- Real task | done"
  assert: errors[0].severity === "error"
  assert: errors[0].message includes "before any project heading"
  assert: projects[0].tasks.length === 1  // only the valid task

test: "missing | separator"
  input: "## Project\n- Task without pipe"
  assert: errors[0].severity === "error"
  assert: errors[0].message includes "missing status separator"
  assert: errors[0].line is a positive number
  assert: projects[0].tasks.length === 0

test: "unknown status → error with suggestion"
  input: "## Project\n- Task | fluxing"
  assert: errors[0].severity === "error"
  assert: errors[0].message includes "Unknown status 'fluxing'"
  assert: errors[0].message includes "Did you mean"

test: "empty task name (| done with nothing before pipe)"
  input: "## Project\n- | done"
  assert: errors[0].message includes "no name"

test: "empty status (Task | with nothing after pipe)"
  input: "## Project\n- Task name |"
  assert: errors[0].message includes "no status"

test: "project with no tasks → warning, not error"
  input: "## Empty Project\n\n## Project With Task\n- Task | done"
  assert: errors.some(e => e.severity === "warning" && e.message.includes("Empty Project"))
  assert: projects.find(p => p.name === "Project With Task").tasks.length === 1

test: "completely empty input → projects: [], errors: []"
  input: ""
  assert: projects.length === 0
  assert: Array.isArray(errors)
```

**Group: normalizeStatus unit tests**
```
import { normalizeStatus, suggestStatus } from './normalizeStatus.mjs'

test: "normalizeStatus returns null for unknown input"
  assert: normalizeStatus("xyz") === null

test: "normalizeStatus is case-insensitive"
  assert: normalizeStatus("WIP")?.canonical === "in progress"
  assert: normalizeStatus("Done")?.canonical === "done"

test: "normalizeStatus preserves rawStatus exactly as passed"
  assert: normalizeStatus("WIP")?.rawStatus === "WIP"
  assert: normalizeStatus("completed")?.rawStatus === "completed"

test: "suggestStatus returns a non-empty string for unknown input"
  assert: typeof suggestStatus("complish") === "string"
  assert: suggestStatus("complish").length > 0
```

**Test file structure:**
```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseWorklog } from "./parser.mjs";
import { normalizeStatus, suggestStatus } from "./normalizeStatus.mjs";

describe("Happy path", () => {
  test("single project, single task with notes", () => { ... });
  // etc.
});

describe("Status normalization", () => { ... });

describe("Error cases", () => { ... });

describe("normalizeStatus unit tests", () => { ... });
```

**Run command:**
```bash
node --test src/parser.test.mjs
```

**Acceptance:**  
All tests pass. Output shows `✓` for each test. Zero failing tests. `node --test src/parser.test.mjs` exits with code 0.

---

## Verification

**Full verification sequence (run in order):**

```bash
cd /Users/Hoi.LeA1/Developer/daily-work

# 1. Dependencies installed
node -e "import('unified').then(() => import('remark-parse')).then(() => import('unist-util-visit')).then(() => console.log('✓ all deps present'))"

# 2. Template file exists and is valid
ls today.template.md && echo "✓ template exists"
grep "## " today.template.md && echo "✓ has project headings"
grep "| " today.template.md && echo "✓ has task lines"

# 3. Status normalizer works
node -e "
import('./src/normalizeStatus.mjs').then(({ normalizeStatus }) => {
  const tests = [['wip','in progress'],['done','done'],['blocked','pending'],['todo','new'],['completed','done']];
  for (const [raw, expected] of tests) {
    const result = normalizeStatus(raw)?.canonical;
    if (result !== expected) throw new Error(\`\${raw} → \${result}, expected \${expected}\`);
  }
  console.log('✓ normalizeStatus: all variants correct');
});
"

# 4. Parser runs on template
node src/parser.mjs today.template.md | node -e "
process.stdin.resume();
let d='';
process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const r=JSON.parse(d);
  if(!r.date||!Array.isArray(r.projects)||!Array.isArray(r.errors)) throw new Error('invalid schema');
  if(r.projects.length===0) throw new Error('no projects parsed from template');
  console.log('✓ parser output is valid ParsedWorklog schema');
  console.log(\`  date: \${r.date}, projects: \${r.projects.length}, tasks: \${r.projects.flatMap(p=>p.tasks).length}\`);
});
"

# 5. All tests pass
node --test src/parser.test.mjs
```

**Expected final output:**
```
✓ all deps present
✓ template exists
✓ has project headings
✓ has task lines
✓ normalizeStatus: all variants correct
✓ parser output is valid ParsedWorklog schema
  date: 2026-04-10, projects: 2, tasks: 5
... (node:test output with all ✓)
```

---

## Requirements Coverage

| Requirement | Task | Delivered By |
|-------------|------|-------------|
| MDF-01 (`##` headings group tasks) | 2.1 | `parseWorklog` heading node → `currentProject` |
| MDF-02 (`- Task \| status` bullets) | 2.1 | `parseListItem` pipe-split logic |
| MDF-03 (indented notes as freeform text) | 2.1 | `noteParagraphs` collection in `parseListItem` |
| MDF-04 (status variants canonicalize) | 1.1 | `normalizeStatus.mjs` with 30+ variant map |
| MDF-05 (starter template) | 0.2 | `today.template.md` |
| PRSR-01 (parse into `ParsedWorklog`) | 2.1 | `parseWorklog()` return schema |
| PRSR-02 (extracts project, task, status, notes) | 2.1 | All four fields populated on each `Task` |
| PRSR-03 (missing notes → empty string) | 2.1 | `noteParagraphs.join("\n\n")` defaults to `""` |
| PRSR-04 (clear errors with line numbers) | 2.1 | All `ParseError` objects include `line`, `message`, `context` |

---

## Output

After successful execution, create `.planning/phases/01-markdown-format-parser/01-SUMMARY.md` with:
- What was built (files created, packages installed)
- Key implementation decisions made (e.g., how loose list notes are handled)
- Any deviations from this plan (e.g., if AST structure differed from expected)
- Verification command output (paste the final test run results)
- What Phase 2 can depend on (exported function signatures, schema shape)
