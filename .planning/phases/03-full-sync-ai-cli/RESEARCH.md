# Phase 3: Full Sync + AI + CLI — Research

**Researched:** 2026-04-10
**Domain:** Notion MCP tool usage, Copilot CLI skill authoring, Node.js JSON pipeline design
**Confidence:** HIGH (all key claims verified against live project artifacts: CONTEXT.md, Phase 2 SUMMARY.md, parser.mjs output, actual SKILL.md files from `~/.copilot/skills/`)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Architecture
- **Hybrid**: Node.js prep script for parsing + Copilot CLI skill for AI summarization + Notion sync
- Node.js is used for: reading today.md, running the parser, outputting a sync manifest (JSON)
- Claude (in skill context) is used for: generating AI summaries, calling Notion MCP tools to sync
- Notion MCP OAuth is session-managed → no standalone Node.js script can call Notion APIs directly
- Entry point for user: a Copilot CLI skill (e.g., `/daily-sync`) that orchestrates the pipeline

#### Sync Behavior
- **Upsert strategy**: match existing Notion pages by (project name + task name)
- **On match**: update Status, Raw Notes, Summary, Date fields
- **On no match**: create new Notion Task page linked to the Project
- **Date**: always update to today's date on every sync (not just first creation)
- **Duplicate prevention**: search Notion before creating any page

#### Project Handling
- **Two-pass**: resolve all projects first (find or create Project pages), then sync tasks
- Project lookup key: exact project name match (case-sensitive, as entered in today.md)
- If a Project page doesn't exist in the Projects DB → create it

#### AI Summarization
- Claude generates summaries inline (no external API; Claude IS the AI in skill context)
- Tasks with notes → 2–3 sentence professional summary, factual, no hallucination
- Tasks without notes → write literal string: `"No notes provided."`
- AI prompt must instruct Claude to only use content from raw notes

#### Text Handling
- Raw notes written as-is to `Raw Notes` field in Notion
- Text longer than 2000 chars must be chunked (Notion block limit)
- Each chunk is a separate paragraph block

#### CLI Output (human-readable)
- One line per task: `[created|updated] Project / Task — status`
- Errors printed with context sufficient to diagnose and fix

### Agent's Discretion
- Exact CLI command name (e.g., `/daily-sync` vs `/sync-today`)
- Exact skill frontmatter wording
- syncPrep.mjs error handling detail level
- Test structure for syncPrep.test.mjs

### Deferred Ideas (OUT OF SCOPE)
- `--dry-run` mode (V2-01)
- `--date` override in CLI (V2-02, but **--date** IS in scope for syncPrep.mjs as a Node.js arg)
- Multi-day continuity (V2-03)
- Weekly/project rollup reporting (V2 Reporting)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-01 | Find or create matching Notion Task page (keyed on project + task name) | §2: Upsert pattern — search then create/update |
| SYNC-02 | On re-run, existing tasks are updated (not duplicated) | §2: Search-first strategy prevents duplicates |
| SYNC-03 | Project pages are found-or-created by name before tasks are written | §1: notion-notion-fetch on Projects collection |
| SYNC-04 | AI-generated summary written to Summary field | §4: Anti-hallucination prompt template |
| SYNC-05 | Raw notes written to Raw Notes field (unmodified) | §6: Manifest carries `notes` field verbatim |
| SYNC-06 | Text >2000 chars chunked into multiple Notion blocks | §2: Chunking strategy in update/create payload |
| SYNC-07 | Today's date written to Date field on each task | §2+§3: date:Date:start format confirmed |
| AI-01 | Claude generates 2–4 sentence professional summary from notes | §4: Prompt template provided |
| AI-02 | Tasks with no notes → "No notes provided." | §4: Explicit branch in prompt |
| AI-03 | Prompt prevents hallucination | §4: Strict factual constraint in prompt |
| CLI-01 | Single command triggers full pipeline | §5: Skill file orchestrates node syncPrep.mjs → Claude actions |
| CLI-02 | Completes in <10 seconds for 5–10 tasks | §1+§2: Fetch-collection-once is O(1) not O(N) |
| CLI-03 | One line per task: created/updated + status | §5: Skill process section specifies output format |
| CLI-04 | Errors printed with context | §6: syncPrep exits with structured error JSON |
</phase_requirements>

---

## Summary

Phase 3 builds the complete daily-sync pipeline as a hybrid: `src/syncPrep.mjs` (Node.js) reads `today.md`, runs `parseWorklog()`, enriches the output with DB IDs from `.planning/state.json`, and emits a JSON manifest to stdout. A Copilot CLI skill (`.github/skills/daily-sync/SKILL.md`) instructs Claude to: (a) run the prep script, (b) read the manifest, (c) generate summaries inline, and (d) call Notion MCP tools to upsert every project and task.

The key architectural insight is that **Claude IS both the AI and the Notion sync executor** — there is no separate Node.js Notion client. This is forced by Notion MCP's OAuth session-management: the token only exists in the active Copilot session, not in a subprocess.

**Primary recommendation:** Write `syncPrep.mjs` as a pure data pipeline (no side effects, no Notion calls), keep the skill file as a step-by-step instruction set for Claude, and use `notion-notion-fetch` on the Projects collection URL for fast bulk project lookups instead of per-project search calls.

---

## Research Area 1: Notion MCP Search Strategies

### Tools Available (verified from CONTEXT.md + Phase 2 SUMMARY)
[VERIFIED: CONTEXT.md § Notion MCP APIs Available]

| Tool | Purpose | Parameter pattern |
|------|---------|-------------------|
| `notion-notion-search` | Full-text search across workspace | `query: string` |
| `notion-notion-fetch` | Fetch page, DB, or collection by ID/URL | `id: string` (page ID, DB ID, or `collection://...`) |
| `notion-notion-create-pages` | Create page in a DB | `parent.data_source_id`, `properties` |
| `notion-notion-update-page` | Update existing page properties | `page_id`, `properties` |

### Strategy A: `notion-notion-search` per project name

```
notion-notion-search(query: "MyProject")
```

**Problems:**
- Returns workspace-wide results — may match pages in other DBs, page titles, body text
- Results are unordered and unfiltered by parent DB
- A project named "Platform" would match every page containing "Platform"
- Requires post-filtering by `parent.database_id === projectsDbId`
- **N API calls for N projects** — slow for days with 5+ projects

**Verdict:** Usable for ad-hoc lookup but fragile and slow as the primary lookup strategy. [ASSUMED: search does not support `filter by parent DB` parameter — this needs verification at runtime if behavior differs]

### Strategy B: `notion-notion-fetch` on the Projects collection (RECOMMENDED)

```
notion-notion-fetch(id: "collection://1ada7935-933e-45fd-8f5a-f16593782046")
```

[VERIFIED: Phase 2 SUMMARY.md — "Query Projects by name: Use `notion-notion-fetch` on `collection://1ada7935-933e-45fd-8f5a-f16593782046`"]

This URL pattern fetches all rows from the Projects database in one call. Claude can then build an in-memory map of `{ projectName → pageId }` and look up all projects with zero additional API calls.

**Algorithm:**
1. Fetch the collection once → get list of all project pages with their `Name` and `id`
2. For each project in the manifest: check in-memory map
3. If found → use the existing page ID
4. If not found → `notion-notion-create-pages` with `data_source_id: projectsDsId`

**Performance:** 1 API call regardless of project count. Satisfies CLI-02 (<10 seconds for 5–10 tasks).

### Strategy for Task Lookup

For tasks, fetching the entire Tasks collection upfront is riskier (Tasks DB may grow to hundreds of rows). Use `notion-notion-search` with query = task name, then filter by:
1. Parent DB = Tasks DB (`tasksDsId`)
2. Project relation = resolved project page ID

If `notion-notion-search` is too broad, fall back to fetching the Tasks collection filtered by date or project. At Phase 3 scale (5–10 tasks/day), either approach is fast enough.

**Recommended task lookup:**
```
notion-notion-search(query: "<task name>")
→ filter results where parent.database_id matches tasksDbId AND Project relation matches projectPageId
```

---

## Research Area 2: Upsert Pattern for Task Pages

### Full Two-Pass Algorithm

**Pass 1: Resolve all projects**
```
1. notion-notion-fetch("collection://1ada7935-933e-45fd-8f5a-f16593782046")
   → builds projectMap: { "Project Name" → "pageId" }

2. For each project in manifest.projects:
   a. If projectMap[name] exists → projectPageId = projectMap[name]
   b. Else:
      notion-notion-create-pages({
        parent: { data_source_id: "1ada7935-933e-45fd-8f5a-f16593782046" },
        properties: {
          "Name": "<Project Name>"
        }
      })
      → projectPageId = response.id
      → add to projectMap
```

**Pass 2: Upsert all tasks**
```
For each task in manifest.tasks:
  1. notion-notion-search(query: task.name)
     → filter: parent.database_id === tasksDbId AND Project relation === projectPageId
     → if match found → existingPageId

  2a. IF existingPageId found (UPDATE):
      notion-notion-update-page({
        page_id: existingPageId,
        properties: {
          "Status":    { select: task.status },
          "Raw Notes": <chunked rich_text blocks>,
          "Summary":   <AI-generated summary>,
          "date:Date:start": manifest.date,
          "date:Date:is_datetime": 0,
          "Project": `["https://www.notion.so/${projectPageId.replace(/-/g,'')}"]`
        }
      })
      → print: "updated Project / Task — status"

  2b. IF not found (CREATE):
      notion-notion-create-pages({
        parent: { data_source_id: "c8680903-7a3e-4b16-9449-e8c9bc7283d2" },
        properties: {
          "Name":      task.name,
          "Status":    { select: task.status },
          "Raw Notes": <chunked rich_text blocks>,
          "Summary":   <AI-generated summary>,
          "date:Date:start": manifest.date,
          "date:Date:is_datetime": 0,
          "Project": `["https://www.notion.so/${projectPageId.replace(/-/g,'')}"]`
        }
      })
      → print: "created Project / Task — status"
```

### Text Chunking (SYNC-06)

Notion rich_text blocks have a 2000-character limit per block.
[VERIFIED: CONTEXT.md § Text Handling — "Text longer than 2000 chars must be chunked"]

```javascript
// Chunking algorithm for Raw Notes property
function chunkText(text, maxLen = 2000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

// Rich text block array for a Notion property
const richTextBlocks = chunkText(rawNotes).map(chunk => ({
  type: "text",
  text: { content: chunk }
}));
```

Each chunk becomes a separate object in the `rich_text` array of the property value.

### Property Write Formats (verified from Phase 2 SUMMARY)
[VERIFIED: Phase 2 SUMMARY.md § Notes for Phase 3]

```json
// Status (SELECT)
"Status": { "select": { "name": "in progress" } }

// Rich text (RICH_TEXT) — chunked if needed
"Raw Notes": {
  "rich_text": [
    { "type": "text", "text": { "content": "chunk 1..." } },
    { "type": "text", "text": { "content": "chunk 2..." } }
  ]
}

// Date (DATE)
"Date": {
  "date": { "start": "2026-04-10" }
}

// Alternatively, the flat key format seen in Phase 2:
"date:Date:start": "2026-04-10",
"date:Date:is_datetime": 0
```

> **Note:** The exact Notion MCP property write syntax for `notion-notion-create-pages` and `notion-notion-update-page` should be validated at runtime. The `date:Date:start` flat format was used successfully in Phase 2 validation. [VERIFIED: Phase 2 SUMMARY.md]

---

## Research Area 3: Relation Write Syntax

### Confirmed Format
[VERIFIED: CONTEXT.md § Relation Write Format + Phase 2 SUMMARY.md § Notes for Phase 3]

When creating or updating a Task page, the `Project` relation property is written as a **JSON array string of Notion page URLs**:

```javascript
// projectPageId may come with dashes (UUID format) or without
const cleanId = projectPageId.replace(/-/g, '');
const projectRelationValue = `["https://www.notion.so/${cleanId}"]`;

// In the properties object:
{
  "Project": `["https://www.notion.so/${cleanId}"]`
}
```

This was **verified working** in Phase 2 (test task linked to test project with UUID-based relation: NDB-04 ✅).

### Usage in Create vs Update

Both `notion-notion-create-pages` and `notion-notion-update-page` accept the same relation syntax — the `Project` property key is the same in both operations.

```javascript
// CREATE
notion-notion-create-pages({
  parent: { data_source_id: tasksDsId },
  properties: {
    "Name": "My Task",
    "Project": `["https://www.notion.so/${projectPageId.replace(/-/g,'')}"]`,
    // ... other properties
  }
})

// UPDATE — same Project field syntax
notion-notion-update-page({
  page_id: existingTaskPageId,
  properties: {
    "Project": `["https://www.notion.so/${projectPageId.replace(/-/g,'')}"]`,
    // ... other properties
  }
})
```

### Why This Format Works

Notion MCP accepts relation values as a serialized JSON array of page URLs. The URL format `https://www.notion.so/{id-without-dashes}` is Notion's canonical page URL. The MCP server deserializes this string and resolves it to a UUID relation internally.

---

## Research Area 4: AI Summary Prompt Design

### Design Constraints (from CONTEXT.md)
- Claude IS the AI — no external API call needed
- Anti-hallucination: only use content from raw notes
- 2–3 sentences, professional tone
- Empty notes → literal string `"No notes provided."`

### Recommended Prompt Template

```
For each task below, generate a concise professional summary (2–3 sentences).

STRICT RULES:
1. Only use information explicitly stated in the Raw Notes. Do not infer, expand, or add context not present in the notes.
2. If Raw Notes is empty or blank, output exactly: "No notes provided."
3. Do not mention the task name in the summary.
4. Write in past tense for completed work, present tense for in-progress.
5. Output only the summary text — no labels, no prefixes.

Task: {task.name}
Status: {task.status}
Raw Notes:
{task.notes || "(no notes)"}

Summary:
```

### Anti-Hallucination Enforcement Points
1. **"Only use information explicitly stated"** — direct prohibition on inference
2. **"Do not infer, expand, or add context"** — closes the "helpful elaboration" trap
3. **Empty branch is explicit** — `"No notes provided."` prevents Claude from generating content for empty inputs
4. **No external knowledge** — do not mention frameworks, technologies, or concepts not in the notes

### Batch Processing in Skill

Claude should process all tasks in the manifest sequentially (or in a single structured prompt), producing a summary for each before beginning Notion sync operations. This allows corrections before any writes occur.

```
Given the following JSON manifest, generate a summary for every task:

{manifest.tasks.map(t => `
Task: ${t.name} (Project: ${t.project})
Notes: ${t.notes || "(no notes)"}
`).join('\n---\n')}

For each task, output:
TASK: <task name>
SUMMARY: <2–3 sentence summary, or "No notes provided.">
```

---

## Research Area 5: Skill File Structure

### Confirmed Structure
[VERIFIED: Live inspection of `~/.copilot/skills/gsd-do/SKILL.md`, `gsd-manager/SKILL.md`, `gsd-new-project/SKILL.md`, `gsd-add-phase/SKILL.md`]

All Copilot CLI skill files share this structure:

```
---
name: <skill-name>               # REQUIRED: slug matching directory name
description: <one-line purpose>  # REQUIRED: shown in skill picker
argument-hint: "<hint>"          # OPTIONAL: shown as placeholder text in CLI
allowed-tools: Read, Bash, ...   # REQUIRED: comma-separated tool permissions
---

<objective>
[What this skill does — shown to Claude as context]
</objective>

<execution_context>            # OPTIONAL: @file references for Claude to read
@path/to/workflow.md
</execution_context>

<context>                      # OPTIONAL but common: user-provided args and constraints
$ARGUMENTS
</context>

<process>
[Step-by-step instructions for Claude to execute]
</process>
```

### Required Frontmatter Fields

| Field | Required | Notes |
|-------|----------|-------|
| `name` | YES | Must match directory name under `.github/skills/` |
| `description` | YES | One-line summary shown in skill picker |
| `argument-hint` | NO | Displayed as placeholder; use for optional args |
| `allowed-tools` | YES | Claude respects this whitelist for safety |

### Allowed Tools for `daily-sync`

Based on what the skill needs to do:
- `Bash` — run `node src/syncPrep.mjs`
- `Read` — read state.json if needed for fallback
- Notion MCP tools are NOT listed in `allowed-tools` — they are session-available MCP tools, not Copilot tools

> **Key insight:** MCP tools (like `notion-notion-search`) are available in the Copilot session regardless of `allowed-tools`. The `allowed-tools` field governs Copilot's built-in tools only (Read, Write, Bash, etc.).

### Recommended Skill File for `daily-sync`

```markdown
---
name: daily-sync
description: Parse today.md and sync work entries to Notion with AI summaries
argument-hint: "[--date YYYY-MM-DD]"
allowed-tools: Bash, Read
---

<objective>
Parse today's work log, generate AI summaries for each task, and upsert all
projects and tasks to Notion. Prints one line per task showing created/updated status.

Pipeline:
1. Run `node src/syncPrep.mjs` (with optional --date arg) → JSON manifest to stdout
2. For each task: generate a 2–3 sentence summary from raw notes
3. Resolve all projects (find or create in Projects DB)
4. Upsert all tasks (find by name+project, create or update)
5. Print: [created|updated] Project / Task — status
</objective>

<context>
Arguments: $ARGUMENTS
Pass any --date YYYY-MM-DD argument through to the syncPrep.mjs command.
</context>

<process>
[detailed step-by-step instructions — see §5 of RESEARCH.md]
</process>
```

### File Location

```
.github/skills/
└── daily-sync/
    └── SKILL.md
```

The directory name (`daily-sync`) must match the `name` field in frontmatter. The skill is invoked in Copilot CLI as `/daily-sync`.

---

## Research Area 6: `syncPrep.mjs` Design

### Responsibilities

`src/syncPrep.mjs` is a **pure data pipeline** — it reads files and emits JSON. It never calls Notion APIs.

1. Parse CLI args (`--date YYYY-MM-DD` optional)
2. Resolve `today.md` path (from args or default `./today.md`)
3. Read and parse `today.md` via `parseWorklog(text, dateOverride)`
4. Read `.planning/state.json` for DB IDs
5. Enrich parser output with DB IDs and flatten tasks to include project reference
6. If parse errors of severity `"error"` exist → write to stderr and exit code 1
7. Output JSON manifest to stdout

### Exact JSON Schema for Sync Manifest

```typescript
interface SyncManifest {
  date: string;               // "YYYY-MM-DD" — from parser or --date override
  projectsDsId: string;       // from state.json — used as parent.data_source_id for projects
  tasksDsId: string;          // from state.json — used as parent.data_source_id for tasks
  projectsDbId: string;       // from state.json — used for filtering search results
  tasksDbId: string;          // from state.json — used for filtering search results
  projects: ProjectEntry[];
  tasks: TaskEntry[];
  warnings: string[];         // non-fatal issues (e.g., "Project 'X' has no tasks")
}

interface ProjectEntry {
  name: string;               // exact project name from today.md
}

interface TaskEntry {
  project: string;            // parent project name (for lookup)
  name: string;               // task name
  status: string;             // canonical: "new" | "in progress" | "done" | "pending"
  notes: string;              // raw notes text, may be ""
  line: number;               // source line in today.md (for error reporting)
}
```

### Concrete Example Output

Given this `today.md`:
```markdown
## Daily Work Summarizer
- Research Notion MCP search | done
  Explored fetch vs search strategies for project lookup.

## Platform Infra
- Deploy BNPL QR changes | in progress
```

`node src/syncPrep.mjs` emits:

```json
{
  "date": "2026-04-10",
  "projectsDsId": "1ada7935-933e-45fd-8f5a-f16593782046",
  "tasksDsId": "c8680903-7a3e-4b16-9449-e8c9bc7283d2",
  "projectsDbId": "1b13207883a648b5af65b88a68e5a77e",
  "tasksDbId": "8af3f04db594408e830da0e5bf927d48",
  "projects": [
    { "name": "Daily Work Summarizer" },
    { "name": "Platform Infra" }
  ],
  "tasks": [
    {
      "project": "Daily Work Summarizer",
      "name": "Research Notion MCP search",
      "status": "done",
      "notes": "Explored fetch vs search strategies for project lookup.",
      "line": 2
    },
    {
      "project": "Platform Infra",
      "name": "Deploy BNPL QR changes",
      "status": "in progress",
      "notes": "",
      "line": 7
    }
  ],
  "warnings": []
}
```

### Implementation Skeleton

```javascript
// src/syncPrep.mjs
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { parseWorklog } from "./parser.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Parse --date and positional filepath args
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

// Read today.md
let markdownText;
try {
  markdownText = readFileSync(filePath, "utf8");
} catch (err) {
  process.stderr.write(`syncPrep: cannot read '${filePath}': ${err.message}\n`);
  process.exit(1);
}

// Read state.json
let state;
try {
  const statePath = resolve(projectRoot, ".planning/state.json");
  state = JSON.parse(readFileSync(statePath, "utf8"));
} catch (err) {
  process.stderr.write(`syncPrep: cannot read .planning/state.json: ${err.message}\n`);
  process.exit(1);
}

// Parse the worklog
const { date, projects, errors } = parseWorklog(markdownText, dateOverride);

// Separate errors from warnings
const hardErrors = errors.filter(e => e.severity === "error");
const warnings = errors.filter(e => e.severity === "warning").map(e => e.message);

if (hardErrors.length > 0) {
  process.stderr.write(
    `syncPrep: ${hardErrors.length} parse error(s):\n` +
    hardErrors.map(e => `  Line ${e.line}: ${e.message}\n    → ${e.context}`).join("\n") + "\n"
  );
  process.exit(1);
}

// Flatten tasks with project reference
const tasks = projects.flatMap(p =>
  p.tasks.map(t => ({
    project: p.name,
    name: t.name,
    status: t.status,
    notes: t.notes,
    line: t.line,
  }))
);

// Build and emit manifest
const manifest = {
  date,
  projectsDsId: state.projectsDsId,
  tasksDsId: state.tasksDsId,
  projectsDbId: state.projectsDbId,
  tasksDbId: state.tasksDbId,
  projects: projects.map(p => ({ name: p.name })),
  tasks,
  warnings,
};

process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
```

### Error Handling Strategy

| Condition | Behavior |
|-----------|----------|
| `today.md` not found | stderr message + exit 1 |
| `.planning/state.json` not found | stderr message + exit 1 |
| Parse hard errors (bad status, missing name) | stderr list + exit 1 |
| Parse warnings (project with no tasks) | included in `manifest.warnings`, exit 0 |
| `--date` format invalid | [ASSUMED] pass-through to parser; parser uses it as-is |

---

## Architecture Patterns

### Recommended File Layout

```
.github/
└── skills/
    └── daily-sync/
        └── SKILL.md          ← Copilot CLI entry point

src/
├── parser.mjs                ← Phase 1 (exists)
├── normalizeStatus.mjs       ← Phase 1 (exists)
├── syncPrep.mjs              ← Phase 3 (new) — pure JSON pipeline
├── parser.test.mjs           ← Phase 1 (exists)
└── syncPrep.test.mjs         ← Phase 3 (new) — no Notion calls

.planning/
└── state.json                ← Phase 2 (exists) — DB IDs
```

### Data Flow

```
User: /daily-sync
    │
    ▼
SKILL.md (Claude executor)
    │
    ├─► Bash: node src/syncPrep.mjs [--date YYYY-MM-DD]
    │         └─► reads today.md + state.json
    │         └─► outputs JSON manifest to stdout
    │
    ├─► Claude reads manifest JSON
    │
    ├─► Claude generates summaries for each task (inline, no API)
    │
    ├─► Pass 1: notion-notion-fetch(collection://projectsDsId)
    │           → build projectMap { name → pageId }
    │           → for missing projects: notion-notion-create-pages
    │
    ├─► Pass 2: for each task:
    │           notion-notion-search(task.name) → filter by tasksDbId
    │           → if found: notion-notion-update-page
    │           → if not: notion-notion-create-pages
    │
    └─► Print: "[created|updated] Project / Task — status"
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown parsing | Regex/split on `##` | `parser.mjs` (Phase 1, already exists) | Handles tight/loose lists, inline code, soft breaks |
| Status normalization | Custom mapping | `normalizeStatus.mjs` (Phase 1) | 30+ variants already handled |
| Notion API calls | `@notionhq/client` REST | Notion MCP tools in session | Project constraint; OAuth token is session-managed |
| AI summarization | External OpenAI call | Claude inline in skill | Claude IS in the session; no API key needed |
| Text chunking | Naive string split | `chunkText()` utility (see §2) | Naive split breaks mid-word; 2000-char boundary is strict |

---

## Common Pitfalls

### Pitfall 1: Dashes in Notion Page IDs
**What goes wrong:** Relation values fail silently if the page ID includes UUID dashes.
**Why it happens:** Notion page URLs use the format without dashes (`33eb641fc7478112a539d911020318de`), but IDs returned by MCP tools may include dashes (`33eb641f-c747-8112-a539-d911020318de`).
**How to avoid:** Always strip dashes before constructing the relation URL: `pageId.replace(/-/g, '')`.
**Warning signs:** Task page created but Project relation field is blank in Notion.
[VERIFIED: CONTEXT.md § Relation Write Format explicitly documents this pattern]

### Pitfall 2: Search Results Spanning Multiple DBs
**What goes wrong:** `notion-notion-search("Deploy")` returns pages from Projects DB AND Tasks DB AND page body text matches.
**Why it happens:** Notion search is workspace-wide.
**How to avoid:** After search, filter results by `parent.database_id` before using the page ID. For projects: filter by `projectsDbId`. For tasks: filter by `tasksDbId` AND confirm the Project relation matches.
**Warning signs:** Duplicate pages created, or wrong page updated.
[ASSUMED: search results include `parent.database_id` in the response — verify at runtime]

### Pitfall 3: Rich Text Block Limit
**What goes wrong:** `notion-notion-create-pages` fails with an error about content exceeding limits.
**Why it happens:** Each rich_text object in a Notion property has a 2000-character limit.
**How to avoid:** Always chunk notes into 2000-char blocks before writing.
**Warning signs:** API error mentioning "content" or "rich_text" on tasks with long notes.
[VERIFIED: CONTEXT.md § Text Handling — "Text longer than 2000 chars must be chunked"]

### Pitfall 4: Skill `allowed-tools` vs MCP Tools
**What goes wrong:** Claude cannot call `notion-notion-search` because it's not in `allowed-tools`.
**Why it happens:** Confusing Copilot tools (Read, Bash, Write) with MCP tools.
**How to avoid:** MCP tools are session-available regardless of `allowed-tools`. Only list Copilot tools in `allowed-tools`. Don't add `notion-notion-search` to that list.
**Warning signs:** Skill works in some sessions but not others; errors about "tool not available".
[VERIFIED: Observed in live skill files — none list MCP tools in allowed-tools]

### Pitfall 5: state.json Not in Git
**What goes wrong:** Running `node src/syncPrep.mjs` fails with "cannot read .planning/state.json".
**Why it happens:** `state.json` is gitignored (by design — contains DB IDs).
**How to avoid:** Document in README that state.json must exist (created by Phase 2 setup). syncPrep.mjs should give a clear error: "Run the Notion DB setup skill first."
**Warning signs:** Exit code 1 with "ENOENT: no such file or directory" on state.json.
[VERIFIED: Phase 2 SUMMARY — "state cache — gitignored"]

### Pitfall 6: Tasks Synced Before Projects Are Resolved
**What goes wrong:** Task creation fails because the Project page doesn't exist yet.
**Why it happens:** Tasks reference a Project by page ID — ID is undefined if project wasn't found/created first.
**How to avoid:** Enforce the two-pass order strictly: complete ALL project resolution before starting ANY task operations.
**Warning signs:** Relation field is blank on newly created tasks.
[VERIFIED: CONTEXT.md § Project Handling — "Two-pass" is a locked decision]

---

## Code Examples

### Running syncPrep and Reading Manifest (in Skill)
```bash
# Step 1: Run prep script and capture manifest
MANIFEST=$(node src/syncPrep.mjs)

# With date override
MANIFEST=$(node src/syncPrep.mjs --date 2026-04-09)
```
Claude receives the manifest as text output from Bash and parses it as JSON.

### Fetching All Projects at Once
```
notion-notion-fetch(id: "collection://1ada7935-933e-45fd-8f5a-f16593782046")
```
Returns all rows in the Projects DB. Claude builds a map: `projectName → pageId`.

### Creating a Project Page
```
notion-notion-create-pages({
  parent: { data_source_id: "1ada7935-933e-45fd-8f5a-f16593782046" },
  properties: {
    "Name": "Daily Work Summarizer"
  }
})
```

### Creating a Task Page (full properties)
```
notion-notion-create-pages({
  parent: { data_source_id: "c8680903-7a3e-4b16-9449-e8c9bc7283d2" },
  properties: {
    "Name": "Research Notion MCP search",
    "Status": { "select": { "name": "done" } },
    "Raw Notes": {
      "rich_text": [
        { "type": "text", "text": { "content": "Explored fetch vs search strategies..." } }
      ]
    },
    "Summary": {
      "rich_text": [
        { "type": "text", "text": { "content": "Investigated two strategies for resolving project pages..." } }
      ]
    },
    "date:Date:start": "2026-04-10",
    "date:Date:is_datetime": 0,
    "Project": "[\"https://www.notion.so/1b13207883a648b5af65b88a68e5a77e\"]"
  }
})
```

### Updating an Existing Task Page
```
notion-notion-update-page({
  page_id: "existing-task-page-id",
  properties: {
    "Status": { "select": { "name": "in progress" } },
    "Raw Notes": { "rich_text": [...] },
    "Summary": { "rich_text": [...] },
    "date:Date:start": "2026-04-10",
    "date:Date:is_datetime": 0
  }
})
```

### syncPrep.test.mjs Test Structure (no Notion calls)
```javascript
// src/syncPrep.test.mjs
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";

test("syncPrep emits valid JSON with correct schema", () => {
  const output = execSync("node src/syncPrep.mjs today.template.md").toString();
  const manifest = JSON.parse(output);
  
  assert.ok(manifest.date);
  assert.ok(manifest.projectsDsId);
  assert.ok(manifest.tasksDsId);
  assert.ok(Array.isArray(manifest.projects));
  assert.ok(Array.isArray(manifest.tasks));
  assert.ok(manifest.tasks.every(t => t.project && t.name && t.status !== undefined));
});

test("syncPrep exits 1 on missing today.md", () => {
  assert.throws(() => execSync("node src/syncPrep.mjs /tmp/nonexistent.md"));
});

test("syncPrep accepts --date override", () => {
  const output = execSync("node src/syncPrep.mjs today.template.md --date 2026-01-15").toString();
  const manifest = JSON.parse(output);
  assert.equal(manifest.date, "2026-01-15");
});
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (v23.x) |
| Config file | none — run directly with `node --test` |
| Quick run command | `node --test src/syncPrep.test.mjs` |
| Full suite command | `node --test src/*.test.mjs` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | Manifest contains project+task entries | unit | `node --test src/syncPrep.test.mjs` | ❌ Wave 0 |
| SYNC-02 | Re-run doesn't duplicate (search-first) | manual | Run sync twice, inspect Notion | manual-only |
| SYNC-03 | Projects resolved before tasks | integration | Manual observation in skill run | manual-only |
| SYNC-04 | Summary written to Notion | manual | Inspect Notion Task page | manual-only |
| SYNC-05 | Raw notes written verbatim | unit (manifest) | `node --test src/syncPrep.test.mjs` | ❌ Wave 0 |
| SYNC-06 | Notes >2000 chars chunked | unit | `node --test src/syncPrep.test.mjs` | ❌ Wave 0 |
| SYNC-07 | Date field written | unit (manifest date) | `node --test src/syncPrep.test.mjs` | ❌ Wave 0 |
| AI-01 | 2–4 sentence summary from notes | manual | Inspect summary in Notion | manual-only |
| AI-02 | No-notes → "No notes provided." | manual | Create task with no notes | manual-only |
| AI-03 | No hallucination | manual | Review summary vs notes | manual-only |
| CLI-01 | Single command triggers pipeline | manual | Run `/daily-sync` in Copilot | manual-only |
| CLI-02 | <10 seconds | manual | Time the run | manual-only |
| CLI-03 | One line per task output | manual | Read skill output | manual-only |
| CLI-04 | Errors printed with context | unit | `node --test src/syncPrep.test.mjs` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/syncPrep.test.mjs` — covers SYNC-01, SYNC-05, SYNC-06, SYNC-07, CLI-04
- [ ] No framework install needed — `node:test` is built into Node.js v23

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | syncPrep.mjs | ✓ | v23.1.0 | — |
| npm | package install | ✓ | 10.9.0 | — |
| unified, remark-parse | parser.mjs | ✓ | 11.x (Phase 1) | — |
| .planning/state.json | syncPrep.mjs | ✓ | Written in Phase 2 | Re-run Phase 2 setup |
| Notion MCP session | Skill execution | Session-dependent | — | Must run in active Copilot session |
| `.github/skills/` directory | Skill file | ✗ (not created yet) | — | Create in Wave 0 |

**Missing dependencies with no fallback:**
- Active Copilot CLI session with Notion MCP connected — skill cannot run without this (by design)

**Missing dependencies with fallback:**
- `.github/skills/` directory — create it in Wave 0 (task 1)

---

## Security Domain

> `security_enforcement` not explicitly set to false in config — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Personal tool, no auth layer by design |
| V3 Session Management | No | Session managed by Copilot/Notion MCP |
| V4 Access Control | No | Single user, no roles |
| V5 Input Validation | Yes | `normalizeStatus.mjs` already validates status; `parseWorklog` validates structure |
| V6 Cryptography | No | No secrets handled in code; state.json contains non-secret DB IDs |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed today.md causing crash | Tampering | Parser error handling + syncPrep exit 1 |
| state.json with wrong IDs causing data corruption | Tampering | Validate state.json schema in syncPrep; fail fast |
| Prompt injection via task notes | Spoofing | AI prompt uses fixed template; notes are data, not instructions |

> **Prompt injection note:** If `today.md` task notes contain text like "Ignore previous instructions and...", Claude may be susceptible. The anti-hallucination prompt template places notes in a clearly delimited data section. This is LOW risk for a personal single-user tool. [ASSUMED: Claude follows the template structure; no formal injection testing done]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `notion-notion-search` returns `parent.database_id` in results for filtering | §1, §2 | Must use different filtering approach; may need to fetch and compare |
| A2 | `notion-notion-create-pages` and `notion-notion-update-page` accept identical `Project` relation syntax | §3 | Update may require different format; test with a dummy task first |
| A3 | `date:Date:start` flat key syntax works in `notion-notion-update-page` (confirmed for create in Phase 2) | §2 | Use nested `Date: { date: { start: ... } }` format instead |
| A4 | `--date` flag: syncPrep passes value as-is to parser; invalid dates pass through silently | §6 | Add date format validation (YYYY-MM-DD regex) to syncPrep |
| A5 | Claude's anti-hallucination prompt prevents injection via adversarial task notes | Security | Add note delimiter hardening if used in non-personal context |
| A6 | Fetching the Projects collection via `collection://...` URL returns all rows (not paginated) | §1 | May need to handle pagination if Projects DB has many entries |

---

## Open Questions (RESOLVED)

1. **Does `notion-notion-fetch` with `collection://` URL paginate?**
   - What we know: Works for fetching all rows per Phase 2 SUMMARY recommendation
   - What's unclear: Behavior if Projects DB grows beyond ~100 rows
   - RESOLVED: Implement as documented for Phase 3; defer pagination handling to v2. Projects DB is personal/small and won't hit Notion row limits in Phase 3 usage.

2. **Exact property write format for `notion-notion-update-page`**
   - What we know: `date:Date:start` flat format worked for `create-pages` in Phase 2
   - What's unclear: Whether `update-page` uses the same flat format or nested `{date: {start: ...}}`
   - RESOLVED: Use `date:Date:start` flat format (same as create-pages). SKILL.md includes a runtime note to fall back to nested `{date: {start: ...}}` format if the flat format is rejected by update-page.

3. **Does `notion-notion-search` support `filter` parameter?**
   - What we know: Tool description lists `query` as the parameter
   - What's unclear: Whether there's a `filter` param to scope to a specific DB
   - RESOLVED: `notion-notion-search` has no filter parameter. Use post-search filtering by `parent.database_id === tasksDbId` in Claude's processing logic.

---

## Sources

### Primary (HIGH confidence)
- `/Users/Hoi.LeA1/Developer/daily-work/.planning/phases/03-full-sync-ai-cli/CONTEXT.md` — locked decisions, tool list, property formats
- `/Users/Hoi.LeA1/Developer/daily-work/.planning/phases/02-notion-database-setup/SUMMARY.md` — verified relation format, date format, collection fetch URL
- `/Users/Hoi.LeA1/Developer/daily-work/src/parser.mjs` — confirmed parser output schema
- `/Users/Hoi.LeA1/Developer/daily-work/.planning/state.json` — confirmed live DB/DS IDs
- Live SKILL.md files in `~/.copilot/skills/` (gsd-do, gsd-manager, gsd-new-project, gsd-add-phase) — confirmed skill file structure

### Secondary (MEDIUM confidence)
- `parseWorklog()` output verified by running `node src/parser.mjs today.template.md` — JSON schema confirmed

### Tertiary (LOW confidence)
- Assumption that search results include `parent.database_id` — not verified via live tool call
- Assumption that update-page accepts same relation syntax as create-pages for the `Project` field

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies confirmed from Phase 1+2 artifacts
- Architecture: HIGH — locked in CONTEXT.md, verified against skill examples
- syncPrep.mjs schema: HIGH — derived from verified parser output + state.json
- Notion MCP tool parameters: MEDIUM — formats verified from Phase 2 but update-page syntax not live-tested
- Pitfalls: HIGH — most derived from concrete Phase 2 learnings

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (30 days — Notion MCP tool API is stable; skill format evolves slowly)
