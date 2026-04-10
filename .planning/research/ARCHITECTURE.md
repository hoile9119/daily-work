# Architecture Patterns

**Project:** Daily Work Summarizer
**Researched:** 2025-04-10
**Confidence:** HIGH (based on direct inspection of local MCP config)

---

## Critical Discovery: Notion MCP Uses OAuth 2.0

Inspecting `.copilot/mcp-config.json` and `.copilot/mcp-oauth-config/`:

```
type:    http
url:     https://mcp.notion.com/mcp
auth:    OAuth 2.0 (clientId: wvNgJ2bABruHuq3x, managed by Copilot CLI)
tokens:  dynamic, stored in ~/.copilot/mcp-oauth-config/
```

**Consequence:** A standalone `node script.js` cannot call `https://mcp.notion.com/mcp` without implementing its own OAuth flow against `https://mcp.notion.com`. The tokens are not static API keys — they expire and are managed by the Copilot CLI runtime.

**Therefore:** The correct invocation pattern is **not** subprocess or SDK from a script. It is running the workflow **as an AI agent inside a Copilot CLI session**, where MCP tools are already authenticated and available natively.

---

## Recommended Architecture: AI Agent Workflow

The tool is a **Copilot CLI skill** — a structured prompt file that Claude executes using its native tool access (bash for file reading, Notion MCP for syncing, built-in AI for summarization).

```
User types: /daily-sync  (or copilot runs the skill file)
     │
     ▼
Claude (AI Agent)
     │
     ├── bash tool          → reads today.md
     ├── [internal]         → parses markdown, builds task model
     ├── [internal]         → generates AI summary per task (no extra API call)
     ├── bash tool          → reads/writes .planning/state.json (ID cache)
     └── notion MCP tools   → creates/updates Projects + Tasks in Notion
```

**Why this is the right call:**
- MCP OAuth is already handled by the Copilot runtime — zero auth config needed
- AI summarization is free (Claude is already running the script)
- No additional API keys, no npm install, no subprocess management
- Satisfies "runnable on demand" — user types a command, it runs
- Fully aligned with "Notion MCP is already connected in the user's Copilot CLI session"

### What "the script" actually is

The entry point is a **Copilot skill file** (markdown prompt in `.copilot/skills/` or a GSD skill definition). It instructs Claude to:

1. Read `today.md` via bash
2. Parse entries into structured data
3. Generate summaries with its AI capabilities
4. Read state cache (`.planning/state.json`)
5. Sync to Notion via MCP tools
6. Write updated state cache

---

## Component Boundaries

| Component | Responsibility | Implemented As | Communicates With |
|-----------|---------------|----------------|-------------------|
| **CLI Entry Point** | Triggers the workflow on demand | Copilot skill / slash command | Claude agent runtime |
| **Markdown Parser** | Reads `today.md`, produces `ParsedWorklog` | Claude parsing the file via bash | Provides input to Task Model |
| **Task Model** | Structured representation of work entries | In-context JSON structure | Consumed by Summarizer + Syncer |
| **AI Summarizer** | Turns freeform notes into readable summaries | Claude's built-in capability | Takes notes, returns summary string |
| **State Cache** | Stores Notion page IDs to avoid duplicate creates | `.planning/state.json` (bash read/write) | Read by Syncer, written after successful sync |
| **Notion Syncer** | Creates/updates Projects + Tasks in Notion | Notion MCP tool calls | State Cache (IDs), Task Model (data) |

---

## Data Flow

```
today.md
    │
    ▼ (bash read)
Raw Text
    │
    ▼ (parse: project/task/status/notes)
ParsedWorklog
  {
    date: "2025-04-10",
    entries: [
      { project: "Backend Infra", task: "Deploy BNPL VietQR", status: "in_progress", notes: "..." },
      { project: "Tooling",       task: "Jira MCP server",    status: "done",         notes: "..." }
    ]
  }
    │
    ▼ (AI: generate summary from notes)
EnrichedWorklog
  { ...same, entries: [..., summary: "Deployed updated infra config for BNPL VietQR flow." ] }
    │
    ▼ (read state.json)
StateCache { projects: { "Backend Infra": "page_id_123" }, tasks: { "Backend Infra::Deploy BNPL VietQR": "page_id_456" } }
    │
    ▼ (for each project)
    ├── Cached ID? → use it
    ├── Not cached? → query_database(Projects, name=project) → use found ID
    └── Not found?  → create_page(Projects, name=project) → new ID → cache it
    │
    ▼ (for each task)
    ├── Cached ID? → update_page(id, status, summary)
    ├── Not cached? → query_database(Tasks, name=task, project=project_id) → use found ID
    └── Not found?  → create_page(Tasks, name=task, project=project_id, status, summary) → cache it
    │
    ▼ (write updated state.json)
Done — print sync report
```

---

## State Cache Schema

File: `.planning/state.json`

```json
{
  "version": 1,
  "notion": {
    "projects_db_id": "abc123-...",
    "tasks_db_id": "def456-...",
    "projects": {
      "Backend Infrastructure": "notion_page_id_aaa"
    },
    "tasks": {
      "Backend Infrastructure::Deploy BNPL VietQR": "notion_page_id_bbb",
      "Tooling::Jira MCP Server": "notion_page_id_ccc"
    }
  }
}
```

**Task key format:** `"ProjectName::TaskName"` — composite key scopes tasks within projects.

**Cache strategy:**
1. Try cached ID first (fast path — direct update, no query)
2. If no cached ID: query Notion by name+project (deduplication safety net)
3. If not found in Notion: create new, cache the ID
4. Always write cache after successful sync

**Why a local cache is correct:**
- Notion queries cost an extra round-trip per item
- Name-based lookup is fragile if task name changes
- Cached IDs survive name edits (update in place)
- For a personal tool, the file is trivially managed

---

## Upsert / Deduplication Strategy

### Deduplication Key

Tasks are unique by `(project_name, task_name)`. The state cache encodes this as `"ProjectName::TaskName"`.

### Decision Tree (per task)

```
state.json has task ID?
├── YES → notion update_page(id, {status, summary})
│         └── 404 error (page deleted)? → fall through to name-based lookup
└── NO  → query Tasks DB: filter title = task_name AND project = project_page_id
          ├── Found (1+ results) → use results[0].id, cache it, update
          └── Not found          → create_page, cache new ID
```

### Project Upsert (same pattern)

Projects are unique by `project_name`. State cache key is just the project name.

### Why NOT match by title alone (without project scope)

Two projects can have identically named tasks (e.g., both have a "Review PR" task). Always filter by project when querying tasks.

---

## Notion Data Model

### Projects Database
| Property | Type | Notes |
|----------|------|-------|
| Name | title | Project name (primary key for lookup) |
| Created | created_time | Auto-managed by Notion |

### Tasks Database
| Property | Type | Notes |
|----------|------|-------|
| Name | title | Task name |
| Status | select | `new` \| `in_progress` \| `done` \| `pending` |
| Summary | rich_text | AI-generated summary |
| Project | relation | Relation to Projects DB |
| Date | date | Date of work entry (from today's date) |

---

## Markdown File Format (to be designed in Phase 1)

The format must be **fast to fill in** and **unambiguous to parse**. Recommended:

```markdown
## Project: Backend Infrastructure

- [ ] Deploy BNPL VietQR new changes on infra
  > Updated infra config, pending staging test

## Project: Tooling

- [x] Experiment Jira MCP server
  > Tested integration, works well with existing workflow
```

**Parsing rules:**
- `## Project: <name>` → new project scope
- `- [ ] <task>` → status = `in_progress` (or `new` if no notes)
- `- [x] <task>` → status = `done`
- `- [-] <task>` → status = `pending`
- `  > <notes>` → freeform notes for AI summarization
- Task with no notes → skip AI summarization, use task name as summary

**Alternative ultra-minimal format (current today.md style):**
```markdown
- experiment jira mcp server -> DONE
- deploy bnpl viet qr new changes on infra
```
This is parseable but loses project grouping. Phase 1 should design a format that supports project scoping — the core value depends on it.

---

## Error Handling Patterns

### Notion MCP Call Failures

| Error Type | Strategy |
|------------|----------|
| Rate limit (429) | Wait and retry — Notion's hosted MCP handles backoff signals |
| Network timeout | Log warning, mark task as "sync_failed", continue with remaining tasks |
| Page not found (404) | Cached ID stale — fall back to name-based lookup, update cache |
| Invalid request (400) | Log full error with task details — likely a data format issue, skip task |
| Auth error (401/403) | Stop entire sync — MCP OAuth session expired, requires user re-auth |

### Partial Sync Failures

**Pattern:** Continue on task failure, report all failures at end.

```
Sync complete:
  ✓ Backend Infrastructure → Deploy BNPL VietQR (updated)
  ✓ Tooling → Jira MCP Server (created)
  ✗ Monitoring → Alerts Review (failed: timeout)

1 task(s) not synced. Re-run to retry.
```

Failures are transient — the next run will retry them (same upsert logic, cache miss → lookup → create/update).

### Corrupt State Cache

If `state.json` is malformed, **start fresh** — delete cache and do name-based lookup for all tasks. This is safe: worst case is slower (extra queries), not incorrect.

---

## Suggested Build Order

### Phase 1: Foundation — Markdown Format + Parser
**Why first:** Every other component depends on the data model the parser produces. Nothing can be built until we know the shape of `ParsedWorklog`.
- Design `today.md` format (project, task, status, notes)
- Implement parser → produces `ParsedWorklog`
- Write format spec and examples

### Phase 2: Notion Database Setup
**Why second:** Notion DB IDs are needed before any sync code can run.
- Create Projects database in Notion (via MCP or manually)
- Create Tasks database with relation to Projects
- Capture database IDs → store in `state.json` as `projects_db_id` / `tasks_db_id`

### Phase 3: Core Sync (Create-Only, No AI)
**Why third:** Prove the data flow works end-to-end before adding AI complexity.
- Implement Notion syncer: create project + task pages
- No deduplication yet, no AI summary
- Manual test: run against today.md, verify Notion pages created

### Phase 4: Upsert + State Cache
**Why fourth:** Make sync idempotent — safe to run multiple times per day.
- Implement state.json read/write
- Add name-based lookup fallback
- Test: run twice, verify no duplicate pages

### Phase 5: AI Summarization
**Why fifth:** Dropped in cleanly once the data pipeline is proven.
- Generate summary per task from notes field
- Attach summary to Notion task page (rich_text property)
- Handle tasks with empty notes (skip summarization, use task name)

### Phase 6: CLI Polish + Error Reporting
**Why last:** UX layer on top of working foundation.
- Sync report output (what was created, updated, failed)
- Error handling for partial failures
- Final format of the skill/entry point

---

## Alternative Architecture (Standalone Script) — Not Recommended

If a standalone `node sync.js` is required in the future:

**Problem:** Notion MCP OAuth tokens are managed by Copilot CLI. A standalone script cannot use them.

**Solutions:**
1. **Notion integration token** (static) — Create a Notion internal integration at `notion.so/my-integrations`, use `@notionhq/client` REST SDK. This bypasses MCP entirely (violates "must use Notion MCP" constraint).
2. **MCP HTTP client with OAuth** — Use `@modelcontextprotocol/sdk` `StreamableHTTPClientTransport` + implement OAuth flow for `https://mcp.notion.com`. Complex, fragile for a personal tool.
3. **Shell wrapper** — Script calls `copilot run` CLI with a skill file. Auth remains in Copilot, script is just a launcher.

**Verdict:** AI agent workflow within Copilot CLI is simpler, more reliable, and fully satisfies all stated requirements.

---

## Sources

- Direct inspection: `~/.copilot/mcp-config.json` — confirms HTTP transport, `https://mcp.notion.com/mcp`
- Direct inspection: `~/.copilot/mcp-oauth-config/` — confirms OAuth 2.0, dynamic tokens (HIGH confidence)
- `@modelcontextprotocol/sdk` v1.29.0 — current SDK version (npm show, HIGH confidence)
- PROJECT.md constraints: "Must use Notion MCP", "already connected in session" (HIGH confidence)
