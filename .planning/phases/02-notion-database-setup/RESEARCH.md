# Phase 2 Research: Notion Database Setup

**Researched:** 2026-04-10
**Domain:** Notion MCP (remote), property schema, state persistence
**Confidence:** MEDIUM — tool JSON schemas verified from Notion SDK; remote MCP tool parameter format partially ASSUMED (cannot interrogate mcp.notion.com without OAuth)

---

## Summary

Phase 2 creates two Notion databases (Projects and Tasks), wires a relation between them, and persists their IDs to `.planning/state.json` so setup is idempotent on re-runs. The executor is Claude itself (Copilot CLI), calling MCP tools directly — **no Node.js scripts run here**. All work is Claude issuing MCP tool calls via the `notion` remote server configured in `~/.copilot/mcp-config.json`.

The Notion MCP is configured as a remote HTTP server (`https://mcp.notion.com/mcp`) named `notion`. Its tools appear in Copilot CLI as `notion-<toolname>` (e.g., `notion-create-database`). Since the MCP server itself prefixes tools with `notion-`, the combined name seen in Copilot CLI is `notion-notion-create-database`. This double-prefix is confirmed by the CONTEXT.md's canonical tool list.

**Primary recommendation:** Create Projects DB first, capture its `data_source_id` from the response, then create Tasks DB with the relation pointing at that `data_source_id`. Use `dual_property` relation so Projects auto-receives a "Tasks" back-link. Store both DB IDs in `.planning/state.json`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Projects DB properties: `Name` (title), `Description` (rich_text)
- Tasks DB properties: `Name` (title), `Status` (select: `new`, `in progress`, `done`, `pending`), `Summary` (rich_text), `Raw Notes` (rich_text), `Date` (date), `Project` (relation → Projects DB)
- Status select options MUST exactly match canonicals: `new`, `in progress`, `done`, `pending`
- DB IDs written to `.planning/state.json` with keys `projectsDbId` and `tasksDbId`
- Execution environment: Copilot CLI skill; no standalone Node.js scripts
- Relation type: UUID-based (Notion MCP stores page UUIDs in relation properties)
- MCP tools available: `notion-notion-create-database`, `notion-notion-update-data-source`, `notion-notion-fetch`, `notion-notion-create-pages`, `notion-notion-update-page`

### the agent's Discretion
- Where in Notion workspace to create the databases (top-level vs under a parent page)
- Whether to create a Board or Table view on the Tasks database for convenience
- Error handling approach if databases already exist but IDs are missing from state cache
- Whether to verify the relation works by creating/deleting a test page

### Deferred Ideas (OUT OF SCOPE)
- Board view on Tasks database
- Calendar view by Date
- Auto-archiving old task pages
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NDB-01 | Create Projects DB with Name (title), Description (rich_text) | JSON property schema verified from Notion SDK TypeScript types |
| NDB-02 | Create Tasks DB with Name (title), Status (select: new/in progress/done/pending), Summary (rich_text), Raw Notes (rich_text), Date (date), Project (relation → Projects) | Select options and relation schema verified; `data_source_id` vs `database_id` distinction documented |
| NDB-03 | DB IDs stored in `.planning/state.json`; setup idempotent | Read/write pattern documented; idempotency guard logic specified |
| NDB-04 | Task→Project relations use page UUIDs | Relation property stores page IDs (UUIDs) as verified by Notion API reference |
</phase_requirements>

---

## Approach

Phase 2 is executed entirely by Claude as a Copilot CLI skill. Claude:
1. Reads `.planning/state.json` to check if DB IDs already exist
2. If not, calls `notion-notion-create-database` twice (Projects first, Tasks second)
3. Uses the Projects DB's `data_source_id` from the first response to wire the relation in the Tasks DB
4. Writes both DB IDs to `.planning/state.json`
5. Optionally creates a test Task linked to a test Project to validate the relation

No JavaScript is written or executed in this phase. Claude IS the script.

---

## Notion MCP DDL Syntax

### Tool Naming (Verified)

The MCP server is registered as `notion` in `~/.copilot/mcp-config.json`:
```json
"notion": {
  "type": "http",
  "url": "https://mcp.notion.com/mcp"
}
```

The remote MCP's tools are prefixed with `notion-`, so in Copilot CLI they appear as:

| MCP Tool Name | Copilot CLI Call Name |
|---------------|----------------------|
| `notion-create-database` | `notion-notion-create-database` |
| `notion-update-data-source` | `notion-notion-update-data-source` |
| `notion-fetch` | `notion-notion-fetch` |
| `notion-create-pages` | `notion-notion-create-pages` |
| `notion-update-page` | `notion-notion-update-page` |

[CITED: https://developers.notion.com/guides/mcp/mcp-supported-tools]

### create-database Tool Description (Verified)
> "Creates a new Notion database, initial data source, and initial view with the specified properties."

[CITED: https://developers.notion.com/guides/mcp/mcp-supported-tools]

### Property Schema Format

**Important:** The CONTEXT.md states `create-database` "uses SQL DDL schema syntax." [ASSUMED] This likely means the tool accepts a structured properties object analogous to SQL DDL (defining columns/types), not literal SQL. The underlying Notion REST API uses a **JSON property schema object**. Since the remote MCP cannot be interrogated without OAuth, assume it passes properties through to the underlying `POST /v1/databases` API.

**Verified JSON property schema** from `@notionhq/notion-sdk-js` TypeScript types [VERIFIED: GitHub makenotion/notion-sdk-js main branch]:

```json
{
  "parent": { "type": "page_id", "page_id": "<PARENT_PAGE_UUID>" },
  "title": [{ "type": "text", "text": { "content": "Projects" } }],
  "properties": {
    "Name": { "title": {} },
    "Description": { "rich_text": {} }
  }
}
```

**Projects DB — exact property schema:**
```json
{
  "parent": { "type": "page_id", "page_id": "<PARENT_PAGE_UUID>" },
  "title": [{ "type": "text", "text": { "content": "Projects" } }],
  "properties": {
    "Name": { "title": {} },
    "Description": { "rich_text": {} }
  }
}
```

**Tasks DB — exact property schema** (requires `data_source_id` from Projects response):
```json
{
  "parent": { "type": "page_id", "page_id": "<PARENT_PAGE_UUID>" },
  "title": [{ "type": "text", "text": { "content": "Tasks" } }],
  "properties": {
    "Name": { "title": {} },
    "Status": {
      "select": {
        "options": [
          { "name": "new",         "color": "gray"   },
          { "name": "in progress", "color": "blue"   },
          { "name": "done",        "color": "green"  },
          { "name": "pending",     "color": "yellow" }
        ]
      }
    },
    "Summary":   { "rich_text": {} },
    "Raw Notes": { "rich_text": {} },
    "Date":      { "date": {} },
    "Project": {
      "relation": {
        "data_source_id": "<PROJECTS_DATA_SOURCE_UUID>",
        "type": "dual_property",
        "dual_property": {}
      }
    }
  }
}
```

### Key API Facts (Verified)

1. **Title property is always named "Name"** — Notion requires exactly one `title`-type property per database; it's the primary key column. [VERIFIED: Notion SDK TypeScript types — `TitlePropertyConfigurationRequest: { title: EmptyObject }`]

2. **`rich_text` vs `text`** — Property type is `rich_text`, not `text`. CONTEXT.md says "(text)" as a display label, but the API type is `rich_text`. [VERIFIED: Notion SDK — `RichTextPropertyConfigurationRequest: { rich_text: EmptyObject }`]

3. **Select options** — `SelectPropertyConfigurationRequest.select.options` is an array of `{ name, color?, description? }`. Colors are optional but strongly recommended for visual distinction. [VERIFIED: Notion SDK TypeScript types]

4. **Date property** — `DatePropertyConfigurationRequest: { date: EmptyObject }`. No format configuration required. [VERIFIED: Notion SDK TypeScript types]

5. **Relation uses `data_source_id`** — In Notion API 2025-09-03, relations reference `data_source_id`, NOT `database_id`. These are different IDs. The Projects DB response will contain a `data_sources` array with entries including `id` (the data source UUID). Use that UUID. [VERIFIED: Notion SDK TypeScript types — `RelationPropertyConfigurationRequest.relation.data_source_id`]

---

## Two-Way Relation Setup

### Architecture

```
Tasks DB                              Projects DB
─────────────────────────────         ─────────────────────────────
Project (relation) ──────────────→   [auto-created: "Tasks" property]
type: "dual_property"                 type: synced_property
```

When creating a `dual_property` relation:
- **Tasks DB** gets the "Project" relation property (you define this)
- **Projects DB** automatically gets a synced "Tasks" property (Notion creates this on the Projects side)

### Correct Relation Schema

```json
"Project": {
  "type": "relation",
  "relation": {
    "data_source_id": "<PROJECTS_DATA_SOURCE_UUID>",
    "type": "dual_property",
    "dual_property": {}
  }
}
```

- `type: "single_property"` → one-way only; Projects DB gets nothing
- `type: "dual_property"` → two-way; Projects DB auto-gets a back-link property named "Tasks" [VERIFIED: Notion SDK TypeScript types — `DualPropertyDatabasePropertyRelationConfigResponse.dual_property`]

### Getting the Projects `data_source_id`

The `create-database` response includes a `data_sources` array:
```json
{
  "object": "database",
  "id": "<DATABASE_UUID>",
  "data_sources": [
    { "id": "<DATA_SOURCE_UUID>", "name": "Projects" }
  ]
}
```

**Step 1:** Create Projects DB → capture `response.data_sources[0].id` → this is `<PROJECTS_DATA_SOURCE_UUID>`
**Step 2:** Create Tasks DB with `relation.data_source_id` = that UUID

If the response structure differs (remote MCP may flatten), use `notion-notion-fetch` on the Projects DB ID to retrieve full metadata including `data_sources`. [ASSUMED: remote MCP response shape may vary from REST API; verify at runtime]

---

## State Cache Pattern

### File: `.planning/state.json`

```json
{
  "projectsDbId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "tasksDbId":    "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
}
```

The file does not exist until Phase 2 runs. It must be gitignored (`.planning/state.json` → add to `.gitignore`).

### Idempotency Logic

```
1. Read .planning/state.json (if file not found, treat as empty object {})
2. IF state.projectsDbId AND state.tasksDbId exist:
   a. Call notion-notion-fetch(state.projectsDbId) → verify DB still exists
   b. IF both DBs confirmed → SKIP creation, log "DBs already exist"
   c. IF a DB is missing (deleted from Notion) → re-create it
3. ELSE: Create both DBs, write IDs to state.json
```

**Why verify existence?** DB IDs in state.json could be stale if someone deleted the databases from Notion. A fetch call catches this; a 404 response means re-create.

### Read/Write Implementation (Claude's Job)

Since Claude IS the executor, the pattern is:

**Read:** Claude uses a bash tool call to read `.planning/state.json` if it exists.
**Write:** Claude uses a bash tool call (or file write tool) to write the JSON after creation.

State file write:
```json
{
  "projectsDbId": "<uuid from create-database response>",
  "tasksDbId": "<uuid from create-database response>"
}
```

The database UUID comes from `response.id` in the `create-database` response (the database object's `id` field, which is the `database_id`). This is different from the `data_source_id` used for relation wiring.

### Cache Keys (Locked)

| Key | Value | Used For |
|-----|-------|----------|
| `projectsDbId` | Projects DB UUID | Idempotency guard; Phase 3 project lookup |
| `tasksDbId` | Tasks DB UUID | Idempotency guard; Phase 3 task creation |

---

## Project Lookup for Phase 3

Phase 3 must find-or-create a Project page by name, then get its UUID for the Task relation property. Here's how:

### Strategy: fetch + filter

**Tool:** `notion-notion-fetch` (fetches database pages) + optionally `notion-notion-create-pages`

```
1. Call notion-notion-fetch(projectsDbId)
   → Returns list of Project pages
2. Filter pages where page.properties.Name.title[0].text.content === targetProjectName
3. IF found: use page.id as relation UUID
4. IF not found: call notion-notion-create-pages(projectsDbId, {Name: targetProjectName})
              → response.id is the new project UUID
```

**Alternative: `notion-search`** — Can search workspace-wide by title, but results can include unrelated pages. Using `notion-notion-fetch` with the known DB ID is more reliable and scoped. [ASSUMED: fetch returns all pages in a database; large DBs may need pagination via `start_cursor`]

### Filter Syntax for `notion-fetch`

When fetching a database with filter, the Notion API supports:
```json
{
  "filter": {
    "property": "Name",
    "title": { "equals": "ProjectName" }
  }
}
```

Whether `notion-notion-fetch` accepts a filter parameter depends on the remote MCP tool's schema. [ASSUMED: remote MCP `notion-fetch` may be read-only/no-filter; if so, fetch all and filter client-side]

### Fallback: `notion-query-database-view`

If `notion-fetch` doesn't support filtering:
- Use `notion-query-database-view` (Business plan required)
- OR fetch all pages and filter in Claude's working memory

**Important:** `notion-query-data-sources` requires Enterprise plan. Do not depend on it.

---

## Relation Validation

### Goal

Verify that a Task page created with `project: [projectPageUUID]` correctly links to the Project page in Notion.

### Approach: Smoke-test with real data

Unlike a unit test, Notion has no dry-run API. Validation must create actual pages. Recommended approach:

**Step 1:** Create a test Project page:
```
notion-notion-create-pages(projectsDbId, { Name: "TEST-PROJECT-PHASE2-VALIDATION" })
→ captures test_project_page_id
```

**Step 2:** Create a test Task page linked to it:
```
notion-notion-create-pages(tasksDbId, {
  Name: "TEST-TASK-PHASE2-VALIDATION",
  Status: "new",
  Project: [{ id: test_project_page_id }]
})
→ captures test_task_page_id
```

**Step 3:** Fetch the Task page and confirm the Project relation property resolves:
```
notion-notion-fetch(test_task_page_id)
→ check response.properties.Project.relation[0].id === test_project_page_id
```

**Step 4 (Cleanup):** Move test pages to trash:
```
notion-notion-update-page(test_task_page_id, { in_trash: true })
notion-notion-update-page(test_project_page_id, { in_trash: true })
```

Notion does not permanently delete pages via API — trashing is the MCP-accessible equivalent. The `in_trash: true` parameter is confirmed in the Notion SDK types. [VERIFIED: Notion SDK TypeScript types — `UpdateDatabaseBodyParameters.in_trash`]

### What "Validation Passed" Means

- `notion-notion-create-pages` succeeds for both pages (no 400 error on relation property)
- `notion-notion-fetch(test_task_page_id).properties.Project.relation` is non-empty
- The relation entry's `id` matches the test project page UUID

If the relation property comes back empty or the create fails with a validation error, the `data_source_id` in the Tasks DB schema is wrong.

---

## Database Placement

### Options

| Option | Pros | Cons |
|--------|------|------|
| **Under a dedicated parent page** (e.g., "Daily Work Tracker") | Clean hierarchy; easy to find in Notion | Need to know/create parent page UUID first |
| **Workspace root** (`"type": "workspace"`) | No parent needed; always works | Clutters top-level sidebar |
| **Under an existing page** (user chooses) | User controls location | Requires user to provide parent page ID |

### Recommendation (Agent's Discretion)

**Create a parent page "Daily Work Tracker" first, then place both databases under it.** This gives:
- A single home for both DBs
- Easy sharing/access control
- Clean workspace

Steps:
1. `notion-notion-create-pages(parent=null)` → creates a private top-level "Daily Work Tracker" page
2. `notion-notion-create-database(parent=that_page_id)` × 2

If creating a top-level page fails (workspace restrictions), fall back to asking the user for a parent page URL/ID to use.

**Alternative:** Ask the user at the start of Phase 2 execution: "Where in your Notion workspace should I create the databases? Please share a parent page URL or say 'workspace root'." This guarantees correct placement without assumptions.

### Parent Page ID Capture

If the user provides a Notion page URL like `https://notion.so/My-Page-abc123...`:
- Extract the UUID: last 32 hex chars, format as `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Use as `parent.page_id` in the `create-database` call

---

## Open Questions

### Q1: Remote MCP exact parameter shape for `notion-create-database`

**What we know:** The tool "Creates a new Notion database with specified properties" [CITED: Notion MCP docs]. The CONTEXT.md says it "uses SQL DDL schema syntax" [ASSUMED from prior research].

**What's unclear:** Whether the remote MCP tool takes raw JSON property objects (like the REST API) or a higher-level abstraction. The term "SQL DDL schema syntax" may refer to Claude describing the schema in DDL-like terms (e.g., "Name TEXT PRIMARY KEY, Status SELECT(new, in progress, done, pending)") rather than literal SQL.

**Proposed resolution:** At Phase 2 execution start, Claude should inspect the `notion-create-database` MCP tool's input schema (via MCP `tools/list` or by examining the tool description) before constructing the call. If the tool takes JSON property objects matching the REST API, use the JSON schemas above. If it takes a different format, adapt accordingly.

### Q2: `data_source_id` vs `database_id` in relation property

**What we know:** The new Notion API (2025-09-03) uses `data_source_id` for relations. The `create-database` response includes a `data_sources` array. [VERIFIED: Notion SDK TypeScript types]

**What's unclear:** Whether the remote MCP's `notion-create-database` response includes `data_sources` or just `id`. The remote MCP may simplify responses.

**Proposed resolution:** After creating Projects DB, call `notion-notion-fetch(projects_db_id)` and look for `data_sources[0].id`. If `data_sources` is absent, try using `database_id` directly in the relation (some Notion API versions accept it). [ASSUMED: fallback exists]

### Q3: Parent page requirement

**What we know:** Notion requires a `parent.page_id` for database creation unless creating at workspace root. [VERIFIED: Notion SDK types — `CreateDatabaseBodyParameters.parent`]

**What's unclear:** Whether the user has a suitable parent page, or whether workspace-root creation is acceptable.

**Proposed resolution:** At execution start, ask the user: "Please share the Notion page URL where you'd like the databases created, or confirm 'workspace root' is fine."

### Q4: Whether `notion-notion-update-page` supports `in_trash: true` for cleanup

**What we know:** The REST API accepts `in_trash: true` on page update. [VERIFIED: Notion SDK types]

**What's unclear:** Whether the remote MCP's `notion-update-page` exposes this parameter.

**Proposed resolution:** If trash-via-MCP fails, note test pages for manual cleanup. Not blocking for setup.

---

## Recommended Approach

Ordered decision list for the planner:

1. **Ask the user for parent page location** before any DB creation — capture a Notion page URL or confirm workspace root.

2. **Inspect `notion-create-database` input schema** at execution time — verify whether it takes JSON property objects or a different format (DDL string, etc.). Adapt the properties definition accordingly.

3. **Create Projects DB first** — capture `response.id` (= `projectsDbId`) and `response.data_sources[0].id` (= relation `data_source_id`).

4. **Create Tasks DB second** — use captured `data_source_id` for the `Project` relation property with `dual_property` type.

5. **Write `.planning/state.json`** — keys `projectsDbId` and `tasksDbId` with the respective DB UUIDs.

6. **Validate relation** — create test Project page, create test Task linked to it, fetch Task to confirm relation populates, trash both test pages.

7. **Idempotency guard** — if `state.json` already has both IDs, fetch both DBs to verify they exist; skip re-creation if they do.

---

## Sources

### Primary (HIGH confidence)
- `@notionhq/notion-sdk-js` TypeScript types — [VERIFIED] `RelationPropertyConfigurationRequest`, `SelectPropertyConfigurationRequest`, `TitlePropertyConfigurationRequest`, `RichTextPropertyConfigurationRequest`, `DatePropertyConfigurationRequest` — https://raw.githubusercontent.com/makenotion/notion-sdk-js/main/src/api-endpoints/common.ts
- Notion MCP README v2.0.0 — [VERIFIED] `create-a-data-source` replaces `create-a-database`; relations use `data_source_id` — https://raw.githubusercontent.com/makenotion/notion-mcp-server/main/README.md
- Notion MCP supported tools page — [CITED] `notion-create-database` description — https://developers.notion.com/guides/mcp/mcp-supported-tools
- `~/.copilot/mcp-config.json` — [VERIFIED] Remote MCP URL and server name `notion`

### Secondary (MEDIUM confidence)
- Notion SDK `data-sources.ts` — `CreateDataSourceBodyParameters` confirmed `parent + properties + title` shape
- Notion MCP server CLAUDE.md — Architecture: tools auto-generated from OpenAPI spec

### Tertiary (LOW confidence / ASSUMED)
- CONTEXT.md claim: "Notion MCP `create-database` uses SQL DDL schema syntax" — cannot verify without OAuth session; may mean "JSON schema analogous to DDL"
- Remote MCP response shape for `create-database` — assumed to include `data_sources` array matching REST API; verify at runtime
- `notion-fetch` filter parameter availability — assumed based on REST API capability

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `notion-create-database` takes JSON property objects matching REST API (not literal SQL DDL) | DDL Syntax | Wrong format causes 400 error; must inspect tool schema at execution start |
| A2 | `create-database` response includes `data_sources[0].id` for relation wiring | Two-Way Relation | Must fall back to `notion-fetch` to retrieve `data_source_id` |
| A3 | `notion-fetch` returns all pages in a DB (for project lookup by name) | Project Lookup | May need `start_cursor` pagination for large DBs |
| A4 | `notion-update-page` supports `in_trash: true` for test page cleanup | Relation Validation | Test pages left in workspace; minor issue |
| A5 | `dual_property` relation creates back-link on Projects DB automatically | Two-Way Relation | Phase 3 may not see relation back-links from Projects side; functional impact low |

**Metadata:**
- Research date: 2026-04-10
- Valid until: 2026-05-10 (Notion API v2025-09-03 is current; remote MCP tool signatures may evolve)
