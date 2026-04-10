# Phase 3 Context: Full Sync + AI + CLI

**Phase**: 03-full-sync-ai-cli
**Depends on**: Phase 2 (Notion DBs exist, state.json written)

## Locked Decisions

### Architecture
- **Hybrid**: Node.js prep script for parsing + Copilot CLI skill for AI summarization + Notion sync
- Node.js is used for: reading today.md, running the parser, outputting a sync manifest (JSON)
- Claude (in skill context) is used for: generating AI summaries, calling Notion MCP tools to sync
- Notion MCP OAuth is session-managed → no standalone Node.js script can call Notion APIs directly
- Entry point for user: a Copilot CLI skill (e.g., `/daily-sync`) that orchestrates the pipeline

### Sync Behavior
- **Upsert strategy**: match existing Notion pages by (project name + task name)
- **On match**: update Status, Raw Notes, Summary, Date fields
- **On no match**: create new Notion Task page linked to the Project
- **Date**: always update to today's date on every sync (not just first creation)
- **Duplicate prevention**: search Notion before creating any page

### Project Handling
- **Two-pass**: resolve all projects first (find or create Project pages), then sync tasks
- Project lookup key: exact project name match (case-sensitive, as entered in today.md)
- If a Project page doesn't exist in the Projects DB → create it

### AI Summarization
- Claude generates summaries inline (no external API; Claude IS the AI in skill context)
- Tasks with notes → 2–3 sentence professional summary, factual, no hallucination
- Tasks without notes → write literal string: `"No notes provided."`
- AI prompt must instruct Claude to only use content from raw notes

### Text Handling
- Raw notes written as-is to `Raw Notes` field in Notion
- Text longer than 2000 chars must be chunked (Notion block limit)
- Each chunk is a separate paragraph block

### CLI Output (human-readable)
- One line per task: `[created|updated] Project / Task — status`
- Errors printed with context sufficient to diagnose and fix

## Technical Constraints

### Notion MCP APIs Available
- `notion-notion-search` — search workspace by query
- `notion-notion-fetch` — fetch page/DB by ID or URL
- `notion-notion-create-pages` — create pages in a DB (data_source_id required)
- `notion-notion-update-page` — update page properties
- `notion-notion-get-users` — list users (not needed for Phase 3)

### IDs from state.json
```json
{
  "projectsDbId": "1b13207883a648b5af65b88a68e5a77e",
  "projectsDsId": "1ada7935-933e-45fd-8f5a-f16593782046",
  "tasksDbId": "8af3f04db594408e830da0e5bf927d48",
  "tasksDsId": "c8680903-7a3e-4b16-9449-e8c9bc7283d2"
}
```

### Relation Write Format
Project field in a Task page:
```js
"Project": `["https://www.notion.so/${projectPageId.replace(/-/g, '')}"]`
```
(JSON array string of Notion page URLs)

### Status Values (must match normalizeStatus.mjs exactly)
- `new` → SELECT option "new" (blue)
- `in progress` → SELECT option "in progress" (yellow)
- `done` → SELECT option "done" (green)
- `pending` → SELECT option "pending" (orange)

### Date Write Format
```json
{ "date:Date:start": "YYYY-MM-DD", "date:Date:is_datetime": 0 }
```

### Files to Create in Phase 3
- `src/syncPrep.mjs` — reads today.md, runs parser, outputs JSON sync manifest to stdout
- `src/syncPrep.test.mjs` — tests for syncPrep (no Notion calls)
- `.github/skills/daily-sync/SKILL.md` — Copilot CLI skill definition (Claude-as-executor)
- `src/parser.mjs` already exists (Phase 1) — import and use directly
