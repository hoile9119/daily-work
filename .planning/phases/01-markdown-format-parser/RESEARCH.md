# Phase 1 Research: Markdown Format + Parser

**Researched:** 2026-04-10  
**Domain:** Markdown file format design + Node.js parser implementation  
**Confidence:** HIGH (stack pre-decided in STACK.md; format decisions are design choices, not ecosystem lookups)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MDF-01 | `today.md` uses `## Project Name` headings to group tasks | Format finalized below; `##` heading chosen over `#` to allow a future top-level title |
| MDF-02 | Tasks are listed as `- Task Name \| status` bullets | Pipe delimiter chosen; unambiguous, easy to type, not used in typical task names |
| MDF-03 | Indented 2+ space lines below each task bullet = notes | Consistent with markdown convention; all indented text merged into single notes string |
| MDF-04 | Status accepts variants and canonicalizes to 4 values | Full normalization table defined in section below |
| MDF-05 | Starter `today.md` template provided | Template defined in section below |
| PRSR-01 | Parse into structured `ParsedWorklog` (project → tasks → notes) | Output schema defined; uses `unified + remark-parse` per STACK.md |
| PRSR-02 | Parser extracts project name, task name, status, raw notes | All 4 fields captured; notes defaults to `""` not `null` |
| PRSR-03 | Task with no notes is valid — notes is empty string, not missing | `notes: ""` for tasks without indented lines |
| PRSR-04 | Clear errors for malformed entries (bad status, missing task name) | Error schema and messages defined below |
</phase_requirements>

---

## Architecture Conflict: Copilot Skill vs. Script

> **⚠️ Conflict detected between research brief and established stack.**

The research brief describes this as a "Copilot CLI skill where Claude parses the markdown directly." However:

- `copilot-instructions.md` describes the project as a **"script-based daily work logger"**
- `REQUIREMENTS.md` PRSR-01 says **"Script parses today.md"**
- `STACK.md` explicitly chose **`unified + remark-parse`** for markdown parsing with full rationale
- `STACK.md` is HIGH confidence (all versions verified from npm registry)

**Resolution: Follow the established stack.** The parser is a Node.js `.mjs` module, not Claude reasoning inline. This is more reliable (deterministic, testable, no API call cost) and consistent with the already-decided architecture.

---

## Parsing Strategy

**Recommendation: Implement a dedicated `src/parser.mjs` module using `unified + remark-parse`.**

### Why not "Claude reads file and reasons about it"

| Criterion | Claude-as-parser | `unified + remark-parse` |
|-----------|-----------------|--------------------------|
| Deterministic | ✗ (model output varies) | ✓ (pure function) |
| Testable | ✗ (requires API call) | ✓ (unit-testable with fixtures) |
| Cost | Tokens on every run | Free after install |
| Speed | 1–3 seconds API round trip | <10ms |
| Format compliance | Hallucination risk | Strict |
| Error line numbers | Cannot guarantee | Exact (AST has position info) |

Claude is used **downstream** for AI summarization (AI-01), not for structural parsing. The parser is a deterministic function.

### Why not a bash/python one-liner

A bash awk/sed parser would handle the happy path but break on:
- Task names containing `|` (would require escaping logic)
- Multi-line notes with blank lines between them
- Unicode characters in project/task names
- Correct line number tracking for error messages

`unified + remark-parse` is already in the stack; adding a shell parser adds a second implementation for the same problem.

### Implementation approach

```
src/
├── parser.mjs       # Pure function: parseWorklog(markdownText) → ParsedWorklog
├── normalizer.mjs   # Pure function: normalizeStatus(raw) → canonical | null
└── sync.mjs         # Main entry point (later phases)
```

**Core parsing logic:**

```js
// Source: unified v11 + remark-parse v11 (STACK.md, verified against npm registry)
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";

export function parseWorklog(markdownText, dateOverride) {
  const date = dateOverride ?? new Date().toISOString().slice(0, 10);
  const tree = unified().use(remarkParse).parse(markdownText);

  const projects = [];
  const errors = [];
  let currentProject = null;
  let currentTask = null;

  // Walk top-level children; structure is flat in remark AST
  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 2) {
      // ## Project Name
      currentProject = { name: extractText(node), tasks: [] };
      projects.push(currentProject);
      currentTask = null;
    } else if (node.type === "list" && currentProject) {
      for (const item of node.children) {
        const result = parseTaskItem(item, currentProject.name);
        if (result.error) {
          errors.push(result.error);
        } else {
          currentProject.tasks.push(result.task);
          currentTask = result.task;
        }
      }
    } else if (node.type === "paragraph" && currentTask) {
      // Loose list items produce a paragraph child — notes continuation
      currentTask.notes += (currentTask.notes ? "\n" : "") + extractText(node);
    }
  }

  return { date, projects, errors };
}
```

**Key insight:** `remark-parse` represents `- Task | status\n  notes` as a `listItem` node whose children include a `paragraph` for the task line and potentially nested content. The notes extraction strategy needs to handle both tight lists (no blank lines between items) and loose lists (blank lines between items produce separate paragraph nodes).

---

## Format Finalization

### Canonical format

```markdown
## Project Name
- Task Name | status
  Notes go here, freeform prose.
  Can be multiple lines.

- Another Task | done
  More notes.

## Another Project
- Task Three | new
```

### Edge case decisions

| Scenario | Decision | Rationale |
|----------|----------|-----------|
| Task with no notes | Valid — `notes: ""` | PRSR-03 explicitly requires this |
| Task with multi-line notes | Merge all indented lines with `\n` into single `notes` string | Preserves line breaks for AI summarization context |
| Blank line between task and its notes | Still captured — `remark-parse` handles loose lists; notes become separate paragraph nodes in the AST | Parser must handle both tight and loose list items |
| Project with no tasks | Emit warning, include project with empty `tasks: []` | Not an error; user may have a section they haven't filled in yet |
| Tasks before any `##` heading | Emit error: `"Tasks found before any project heading at line N"` | Ambiguous ownership; fail clearly |
| Task name contains `\|` | Document as unsupported in template; parser uses last `\|` as the status separator | `split(\|)` → take last element as status, rest as name — handles most cases |
| No `## headings` at all | Return `projects: [], errors: [{ message: "No project headings found" }]` | Whole file is malformed |
| `## ` heading with no name | Error: `"Empty project name at line N"` | |
| `- ` bullet with no `\|` | Error: `"Task at line N is missing status (expected '- Task Name \| status')"` | |
| Empty task name before `\|` | Error: `"Task at line N has no name (found '\| status')"` | |

### What the format does NOT need

- YAML frontmatter for date (date comes from filesystem timestamp or `--date` flag — V2-02)
- Nested sub-tasks or `###` sub-headings (out of scope for v1)
- Code blocks or tables inside notes (not a user use case; would complicate parser)

---

## Status Normalization Table

**Canonical values:** `new`, `in progress`, `done`, `pending`

### Complete normalization map

| Input (case-insensitive) | Canonical | Notes |
|--------------------------|-----------|-------|
| `new` | `new` | canonical |
| `todo` | `new` | common alias |
| `to do` | `new` | spaced variant |
| `not started` | `new` | descriptive variant |
| `open` | `new` | PM tool convention |
| `in progress` | `in progress` | canonical |
| `in-progress` | `in progress` | hyphen variant |
| `in_progress` | `in progress` | underscore variant |
| `wip` | `in progress` | standard abbreviation |
| `working` | `in progress` | active verb |
| `started` | `in progress` | past tense active |
| `active` | `in progress` | PM tool convention |
| `ongoing` | `in progress` | descriptive |
| `done` | `done` | canonical |
| `complete` | `done` | common alias |
| `completed` | `done` | past tense |
| `finish` | `done` | verb form |
| `finished` | `done` | past tense |
| `closed` | `done` | Jira/GitHub convention |
| `resolved` | `done` | Jira convention |
| `shipped` | `done` | product convention |
| `merged` | `done` | git convention |
| `pending` | `pending` | canonical |
| `blocked` | `pending` | means "not progressing" |
| `on hold` | `pending` | spaced variant |
| `on-hold` | `pending` | hyphen variant |
| `onhold` | `pending` | merged variant |
| `waiting` | `pending` | descriptive |
| `wait` | `pending` | short form |
| `paused` | `pending` | descriptive |
| `deferred` | `pending` | PM convention |

**Any other value:** error → `"Unknown status '${raw}' at line N. Did you mean: ${suggestions}?"`

### Normalization implementation

```js
// src/normalizer.mjs
const STATUS_MAP = {
  new: "new", todo: "new", "to do": "new", "not started": "new", open: "new",
  "in progress": "in progress", "in-progress": "in progress", in_progress: "in progress",
  wip: "in progress", working: "in progress", started: "in progress",
  active: "in progress", ongoing: "in progress",
  done: "done", complete: "done", completed: "done", finish: "done",
  finished: "done", closed: "done", resolved: "done", shipped: "done", merged: "done",
  pending: "pending", blocked: "pending", "on hold": "pending", "on-hold": "pending",
  onhold: "pending", waiting: "pending", wait: "pending", paused: "pending", deferred: "pending",
};

export function normalizeStatus(raw) {
  const key = raw.trim().toLowerCase();
  return STATUS_MAP[key] ?? null; // null = unknown, caller emits error
}
```

---

## Starter Template

This is the file that ships as `today.md` in the repo. It uses in-file comments (markdown blockquotes) to guide the user without cluttering the format.

```markdown
## Project Alpha
- Set up CI pipeline | in progress
  Configured GitHub Actions workflow. Still need to add deploy step.
  Blocked on staging credentials from DevOps.

- Write unit tests for auth module | done
  Covered happy path and token expiry cases. 80% coverage achieved.

## Project Beta
- Kick off design review | new

## Admin
- Weekly sync with manager | done
  Discussed Q2 roadmap priorities. Action: send agenda before next Friday.
```

**Template design decisions:**

| Decision | Rationale |
|----------|-----------|
| Include real-looking example content (not `Task Name here`) | Users see the pattern in context; easier to follow than placeholders |
| Three projects with variety of statuses | Demonstrates all canonical statuses in action |
| One task with multi-line notes | Shows notes spanning multiple lines |
| One task with no notes | Shows that notes are optional |
| `## Admin` section | Common real-world use case; validates `##` headings work for any name |

**Do NOT add `<!-- comment -->` HTML comments or `>` blockquote hints** — these would appear in parsed output and complicate the parser. The format should be self-evident from examples, not documentation-within-file.

---

## Output Schema

### `ParsedWorklog` (top-level)

```typescript
interface ParsedWorklog {
  date: string;          // "YYYY-MM-DD" — today's date or --date override
  projects: Project[];   // ordered as they appear in the file
  errors: ParseError[];  // empty array if no errors (never null)
}
```

### `Project`

```typescript
interface Project {
  name: string;          // trimmed text of the ## heading
  tasks: Task[];         // ordered as they appear under the heading
}
```

### `Task`

```typescript
interface Task {
  name: string;          // trimmed text before the | separator
  status: CanonicalStatus; // "new" | "in progress" | "done" | "pending"
  rawStatus: string;     // original user-typed status (before normalization, e.g. "wip")
  notes: string;         // trimmed concatenation of indented lines; "" if none (never null)
  line: number;          // 1-based line number in today.md (for error context in later phases)
}
```

### `ParseError`

```typescript
interface ParseError {
  line: number;          // 1-based line number in today.md
  message: string;       // human-readable error description
  severity: "error" | "warning"; // error = skip this task; warning = continue with defaults
  context: string;       // the raw line text that caused the error
}
```

### `CanonicalStatus`

```typescript
type CanonicalStatus = "new" | "in progress" | "done" | "pending";
```

### Example valid output

```json
{
  "date": "2026-04-10",
  "projects": [
    {
      "name": "Project Alpha",
      "tasks": [
        {
          "name": "Set up CI pipeline",
          "status": "in progress",
          "rawStatus": "wip",
          "notes": "Configured GitHub Actions workflow.\nBlocked on staging credentials.",
          "line": 2
        },
        {
          "name": "Write unit tests for auth module",
          "status": "done",
          "rawStatus": "done",
          "notes": "",
          "line": 6
        }
      ]
    }
  ],
  "errors": []
}
```

### Example output with errors

```json
{
  "date": "2026-04-10",
  "projects": [
    {
      "name": "Project Beta",
      "tasks": []
    }
  ],
  "errors": [
    {
      "line": 3,
      "message": "Unknown status 'in-flux' at line 3. Did you mean: 'in progress'?",
      "severity": "error",
      "context": "- Refactor auth module | in-flux"
    },
    {
      "line": 7,
      "message": "Task at line 7 is missing status separator (expected '- Task Name | status')",
      "severity": "error",
      "context": "- Deploy to staging"
    }
  ]
}
```

**Schema design decisions:**

| Decision | Rationale |
|----------|-----------|
| `rawStatus` field on Task | Preserves what the user typed; useful for debugging and display |
| `line` number on Task and ParseError | Enables CLI output like "Line 7: ..." — critical for PRSR-04 |
| `notes: ""` not `notes: null` | PRSR-02/PRSR-03: empty string is explicit; null creates undefined-check noise downstream |
| `errors: []` always present | Downstream code never needs to guard `if (result.errors)` |
| `severity: "error" | "warning"` | Allows soft failures (project with no tasks = warning, skip task) vs hard failures (bad status = error, skip task) |
| Tasks with errors are omitted from `projects` | Prevents downstream Notion sync from receiving malformed data |

---

## Error Handling

### Failure modes and messages

| Scenario | Severity | Message Template | Action |
|----------|----------|-----------------|--------|
| No `##` headings found | error | `"No project headings found in today.md. Use ## Project Name to group tasks."` | Return empty projects, stop |
| Task before any heading | error | `"Task at line N appears before any project heading: '{context}'"` | Skip task |
| Missing `\|` separator | error | `"Task at line N is missing status separator (expected '- Task Name \| status'): '{context}'"` | Skip task |
| Empty task name (`\| done`) | error | `"Task at line N has no name before the '\|' separator: '{context}'"` | Skip task |
| Empty status (`Task \|`) | error | `"Task at line N has no status after the '\|' separator: '{context}'"` | Skip task |
| Unknown status | error | `"Unknown status '{raw}' at line N. Did you mean: '{suggestion}'?"` | Skip task |
| Project with no tasks | warning | `"Project '{name}' has no tasks — it will not be synced"` | Include project, tasks: [] |
| Empty project name | error | `"Empty project heading at line N"` | Skip project |

### Closest-match suggestion for unknown status

For unknown statuses, suggest the canonical value whose known aliases are closest to the input using simple string similarity:

```js
function suggestStatus(raw) {
  const canonicals = ["new", "in progress", "done", "pending"];
  // Simple approach: check which canonical's alias set has the most character overlap
  // Or just hardcode the most common typos and fall back to listing all 4 options
  const common = { "inp": "in progress", "prog": "in progress", "compl": "done", "fin": "done" };
  for (const [prefix, canonical] of Object.entries(common)) {
    if (raw.toLowerCase().startsWith(prefix)) return canonical;
  }
  return canonicals.join(", "); // "new, in progress, done, pending"
}
```

### CLI error output format (PRSR-04 / CLI-04)

```
⚠  today.md has 2 errors:

  Line 3: Unknown status 'in-flux' — did you mean 'in progress'?
          → - Refactor auth module | in-flux

  Line 7: Missing status separator (expected '- Task Name | status')
          → - Deploy to staging

Fix these entries and re-run. 0 tasks synced.
```

---

## Open Questions (RESOLVED)

### 1. Multi-paragraph notes with blank lines (tight vs. loose list)
**What we know:** In `remark-parse`, blank lines between list items make the list "loose" — each item's content becomes a `paragraph` node. Notes lines without a blank line before them (tight list) appear inline in the `listItem`.

**What's unclear:** If a user writes:
```
- Task | wip

  First paragraph of notes.

  Second paragraph of notes.
```
The blank lines make this a loose list item with two paragraph children. Does the parser merge both paragraphs into `notes`?

**RESOLVED:** Both tight and loose list formats are handled by the updated extraction approach:
- **Tight lists** (common): The task line and notes are in the same paragraph node, separated by soft-break (`break`) AST nodes. `extractText` returns `"\n"` for `break` nodes, so `fullText.split("\n")` cleanly separates the task line (index 0) from the inlined notes (index 1+).
- **Loose lists**: Notes appear as additional `paragraph` children after the first paragraph. These are collected via `item.children.filter(c => c.type === "paragraph").slice(1)` and joined with `\n\n`.
- Both sources are merged: `[...noteParagraphs, inlinedNotes].filter(Boolean).join("\n\n")`.

### 2. Notes that look like markdown (bold, links, etc.)
**What's unclear:** If a user writes `  Made **significant** progress` in their notes, should `notes` contain the raw markdown or the plain text?

**RESOLVED:** Pass raw text to the AI summarizer. `extractText` strips markdown syntax (bold, emphasis, links → plain text), which is fine because Claude handles markdown naturally and Notion accepts prose. Stripping is safer than preserving `**` syntax which could confuse downstream text processing.

### 3. Today.md file location
**What's unclear:** Is `today.md` always at the project root? What if the user has multiple day files?

**RESOLVED:** Default is `./today.md` (cwd). The parser accepts an optional path argument via `process.argv[2] ?? "./today.md"` in the CLI runner. Multi-day file support is deferred to V2-02.

### 4. Multi-paragraph loose notes (blank lines between note paragraphs)
**What's unclear:** If a user writes multiple blank-line-separated paragraphs as notes in a loose list, are all captured?

**RESOLVED:** Yes — `item.children.filter(c => c.type === "paragraph").slice(1)` collects ALL additional paragraph children (not just the second one). They are joined with `\n\n` to preserve the paragraph separation. The updated implementation fully handles this case.

---

## Sources

### Primary (HIGH confidence)
- `STACK.md` (`.planning/research/STACK.md`) — unified v11.0.5, remark-parse v11.0.0 verified from npm registry
- `REQUIREMENTS.md` (`.planning/REQUIREMENTS.md`) — canonical requirement IDs and descriptions
- `copilot-instructions.md` — project constraints (Node.js, ESM, no TypeScript build step)

### Secondary (ASSUMED — design decisions)
- Status normalization table: based on common PM tool conventions (Jira, GitHub, Linear). Not looked up from an external source. [ASSUMED]
- Edge case decisions (loose vs tight lists): based on remark-parse AST behavior from training knowledge. [ASSUMED — verify with a quick remark-parse test when implementing]
- Starter template content: author's judgment. [ASSUMED]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `remark-parse` produces a flat list of `heading` and `list` nodes at the top level when parsing the proposed format | Parsing Strategy | Parser walk logic would need adjustment; verify with a test fixture during Wave 0 |
| A2 | Loose list items (with blank lines) produce multiple `paragraph` children inside the `listItem` node | Format Finalization / Open Questions | Multi-paragraph notes would not be captured; add loose-list test fixture |
| A3 | Status normalization table covers the variants users will actually type | Status Normalization Table | Missing variants cause unnecessary errors; easy to extend the map |
| A4 | Storing raw markdown in `notes` (not plain text) is correct for downstream AI summarization | Output Schema | If AI prompt needs plain text, notes field must be stripped before passing to OpenAI |

**Total verified claims:** All stack decisions (HIGH — from STACK.md). All format/schema decisions are design choices (no external truth to verify against).
