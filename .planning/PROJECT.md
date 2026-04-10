# Daily Work Summarizer

## What This Is

A Copilot CLI skill (`/daily-sync`) that reads a structured markdown file (`today.md`), uses AI to generate summaries from freeform notes, and syncs the results to Notion via MCP. Projects and tasks are organized in two related Notion databases, each task carrying status, raw notes, an AI summary, and the sync date.

## Current State (v1.0 — Shipped 2026-04-10)

The full pipeline is live:
1. User fills in `today.md` with `## Project` headings and `- Task | status` bullets
2. `/daily-sync` runs: parses → AI-summarizes → syncs to Notion
3. Each task appears in Notion with status, raw notes, AI summary, and today's date

**Notion:**
- Projects DB: `1b13207883a648b5af65b88a68e5a77e`
- Tasks DB: `8af3f04db594408e830da0e5bf927d48`
- State cached at `.planning/state.json` (gitignored)

**Known tech debt:**
- Idempotent re-run (UPDATE path) implemented but not live-validated
- 2000-char chunking in SKILL.md not exercised with large notes

## Core Value

Your daily work is captured once in a markdown file and automatically reflected in Notion — no manual Notion editing required.

## Requirements

### Validated (v1.0)

- [x] Markdown file format designed for daily work logging (project, task, status, notes)
- [x] Parser reads `today.md` and extracts entries by project and task (40 tests)
- [x] AI generates a concise 2–4 sentence summary from freeform notes per task
- [x] Notion databases created: Projects (parent) → Tasks (children) with UUID relation
- [x] Task status synced to Notion: new / in progress / done / pending
- [x] AI summary and raw notes written to task entry in Notion
- [x] Script is runnable on demand via `/daily-sync` Copilot CLI skill

### Next Milestone (v2.0 — TBD)

_(To be defined with `/gsd-new-milestone`)_

### Out of Scope

- Automatic scheduling / cron jobs — user runs the script when ready
- Pulling work data from git, Jira, or calendar — markdown file is the only source
- Editing or deleting existing Notion entries — create/update only
- Multi-user support — personal tool for one user

## Context

- The project lives at `/Users/Hoi.LeA1/Developer/daily-work`
- Notion MCP is connected in the user's Copilot CLI session (session-managed OAuth)
- The tool is a Copilot CLI skill — standalone Node.js cannot authenticate against Notion MCP
- Notion structure: two related databases — **Projects** and **Tasks** — where tasks belong to a project

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Copilot CLI skill (not standalone Node.js) | Notion MCP OAuth is session-managed | ✅ Validated — only path that works |
| Markdown as input source | Simple, fast, no dependencies | ✅ Validated |
| Notion MCP for sync | Already available in session | ✅ Validated |
| Projects + Tasks as separate Notion DBs | 1 project : many tasks, filterable | ✅ Validated |
| AI summary per task | Notes are freeform — AI makes them consistent | ✅ Validated |
| Upsert keyed on project + task name | Deterministic, no external ID | ✅ Validated |
| AI summaries batched before Notion writes | Avoids context-switching mid-sync | ✅ Validated |

## Evolution

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-10 — v1.0 shipped*
