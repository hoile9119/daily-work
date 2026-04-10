# Roadmap: Daily Work Summarizer

## Overview

Three phases deliver the complete pipeline: first lock the markdown format and build the parser (the load-bearing foundation everything else depends on), then stand up the Notion database schema (DB IDs must exist before sync runs), then wire the full sync pipeline with AI summarization and CLI polish. Coarse granularity collapses what could be 5 phases into 3 coherent delivery boundaries.

## Phases

- [ ] **Phase 1: Markdown Format + Parser** - Design `today.md` format and build the AST-based parser that produces `ParsedWorklog`
- [ ] **Phase 2: Notion Database Setup** - Create Projects and Tasks Notion databases, store IDs, validate relations
- [ ] **Phase 3: Full Sync + AI + CLI** - Wire end-to-end pipeline: parse → AI summarize → upsert to Notion → human-readable output

## Phase Details

### Phase 1: Markdown Format + Parser
**Goal**: Users can fill in `today.md` and have it parsed into a structured, validated worklog
**Depends on**: Nothing (first phase)
**Requirements**: MDF-01, MDF-02, MDF-03, MDF-04, MDF-05, PRSR-01, PRSR-02, PRSR-03, PRSR-04
**Success Criteria** (what must be TRUE):
  1. User can fill in `today.md` using `## Project`, `- Task | status`, and indented notes — and the format is self-explanatory from the starter template
  2. Parser extracts project name, task name, canonicalized status, and raw notes for every entry in `today.md`
  3. Tasks with no notes are parsed without errors (notes field is empty, not missing)
  4. A malformed entry (bad status, missing task name) produces a clear error message with enough context to fix it
  5. Status variants like "wip", "in-progress", "done", "complete" all resolve to their canonical form
**Plans**: TBD

### Phase 2: Notion Database Setup
**Goal**: Notion databases for Projects and Tasks exist, are correctly related, and their IDs are cached locally
**Depends on**: Phase 1
**Requirements**: NDB-01, NDB-02, NDB-03, NDB-04
**Success Criteria** (what must be TRUE):
  1. A Projects Notion database exists with Name (title) and Description (text) properties
  2. A Tasks Notion database exists with Name, Status (select), Summary (text), Raw Notes (text), Date (date), and Project (relation to Projects) properties
  3. Both database IDs are persisted to a local state cache so setup does not re-run on subsequent invocations
  4. A Task page created with a project relation is visibly linked to the correct Project page in Notion (UUID-based, not name-based)
**Plans**: TBD

### Phase 3: Full Sync + AI + CLI
**Goal**: User runs one command and their `today.md` is fully reflected in Notion — with AI summaries, idempotent upserts, and readable output
**Depends on**: Phase 2
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06, SYNC-07, AI-01, AI-02, AI-03, CLI-01, CLI-02, CLI-03, CLI-04
**Success Criteria** (what must be TRUE):
  1. Running the command once creates all projects and tasks in Notion with status, raw notes, AI summary, and today's date
  2. Running the command a second time updates existing tasks (no duplicate pages created)
  3. Each task with notes has a concise 2–4 sentence AI-generated summary; tasks without notes show "No notes provided."
  4. The terminal output shows one line per task with name, status, and whether it was created or updated — no raw JSON
  5. A typical day of 5–10 tasks completes in under 10 seconds; errors print with enough context to diagnose and fix
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Markdown Format + Parser | 0/? | Not started | - |
| 2. Notion Database Setup | 0/? | Not started | - |
| 3. Full Sync + AI + CLI | 0/? | Not started | - |
