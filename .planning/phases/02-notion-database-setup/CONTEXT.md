# Phase 2: Notion Database Setup - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 creates the Notion database schema that Phase 3 writes into. It must:
- Create a **Projects** Notion database (via Notion MCP)
- Create a **Tasks** Notion database related to Projects (via Notion MCP)
- Persist both DB IDs to a local state file so setup is idempotent
- Validate that the relation link works (task ↔ project UUID join)

Phase 2 does NOT: sync any worklog data, parse today.md, or call AI.

</domain>

<decisions>
## Implementation Decisions

### Database schemas (locked — from NDB-01, NDB-02)
- **Projects DB properties:** Name (title), Description (rich_text)
- **Tasks DB properties:** Name (title), Status (select: new/in progress/done/pending), Summary (rich_text), Raw Notes (rich_text), Date (date), Project (relation → Projects DB)

### State cache (locked — from NDB-03)
- DB IDs written to `.planning/state.json` (already gitignored in Phase 1)
- Cache prevents re-creation on re-runs: if IDs already in state.json AND databases exist in Notion, skip creation

### Relation type (locked — from NDB-04)
- Tasks→Projects relation is UUID-based (Notion MCP stores page UUIDs in relation properties)
- No name-based linking; relations set via `notion-notion-update-issue` with UUID arrays

### Execution environment (locked — from research)
- Runs as a Copilot CLI skill; Notion MCP is the only way to access Notion (OAuth managed by CLI session)
- No standalone Node.js scripts that call Notion API directly

### the agent's Discretion
- Where in Notion workspace to create the databases (top-level vs under a parent page)
- Whether to create a Board or Table view on the Tasks database for convenience
- Error handling approach if databases already exist but IDs are missing from state cache
- Naming conventions for the state.json keys
- Whether to verify the relation works by creating/deleting a test page

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 output (parser output this phase depends on)
- `src/parser.mjs` — `parseWorklog()` returns `ParsedWorklog`; Phase 2 does not call this but Phase 3 does; schema must be understood
- `src/normalizeStatus.mjs` — status canonicals: `new`, `in progress`, `done`, `pending` — Tasks DB Status select options must match exactly

### Project docs
- `.planning/REQUIREMENTS.md` — NDB-01…04 (Phase 2 requirements)
- `.planning/ROADMAP.md` — Phase 2 goal and success criteria
- `.planning/PROJECT.md` — architectural constraint: Copilot CLI skill; Notion MCP is the integration mechanism

### Available Notion MCP tools (relevant to this phase)
- `notion-notion-create-database` — creates DB with SQL DDL schema syntax
- `notion-notion-update-data-source` — add/modify schema after creation
- `notion-notion-fetch` — fetch page/DB details and data source IDs
- `notion-notion-create-pages` — create pages in DB (for relation test)
- `notion-notion-update-page` — update page properties

</canonical_refs>

<specifics>
## Specific Ideas

- Status select options must use the EXACT canonicals from `normalizeStatus.mjs`: `new`, `in progress`, `done`, `pending`
- The state cache key names should be `projectsDbId` and `tasksDbId` for clarity
- The two-way relation: Tasks has "Project" (relation to Projects), Projects auto-gets "Tasks" synced property
- Phase 3 will look up project page by name to get its UUID → Tasks DB relation; the Projects DB name property must be searchable/queryable

</specifics>

<deferred>
## Deferred Ideas

- Board view on Tasks database — nice-to-have, not in NDB-01…04
- Calendar view by Date — v2 feature
- Auto-archiving old task pages — out of scope

</deferred>

---

*Phase: 02-notion-database-setup*
*Context gathered: 2026-04-10*
