# Daily Work Summarizer

## What This Is

A script-based daily work logger that reads a structured markdown file, uses AI to generate summaries from freeform notes, and syncs the results to Notion via MCP. Projects and tasks are organized in Notion with a parent-child relationship, and each task carries a status (new, in progress, done, pending).

## Core Value

Your daily work is captured once in a markdown file and automatically reflected in Notion — no manual Notion editing required.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Markdown file format designed for daily work logging (project, task, status, notes)
- [ ] Script reads the markdown file and parses entries by project and task
- [ ] AI generates a human-readable summary from freeform notes per task
- [ ] Notion database created from scratch: Projects (parent) → Tasks (children)
- [ ] Task status synced to Notion: new / in progress / done / pending
- [ ] AI summary written to task entry in Notion
- [ ] Script is runnable on demand (not scheduled)

### Out of Scope

- Automatic scheduling / cron jobs — user runs the script when ready
- Pulling work data from git, Jira, or calendar — markdown file is the only source
- Editing or deleting existing Notion entries — create/update only
- Multi-user support — personal tool for one user

## Context

- The project lives at `/Users/Hoi.LeA1/Developer/daily-work`
- Notion MCP is already connected in the user's Copilot CLI session
- The markdown file (`today.md`) will be designed as part of this project
- The tool targets the user's personal Notion workspace
- Notion structure: two related databases — **Projects** and **Tasks** — where tasks belong to a project

## Constraints

- **Integration**: Must use Notion MCP (already available in session) — no raw REST API calls
- **Input**: Single markdown file per day; format designed to be fast to fill in
- **AI**: Summaries generated from notes field — concise, professional tone
- **Scope**: Personal tool — no auth layer, no multi-tenant concerns

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Markdown as input source | Simple, fast, no dependencies — user fills it in, script reads it | — Pending |
| Notion MCP for sync | Already available in session, no API key setup needed | — Pending |
| Projects + Tasks as separate Notion DBs | 1 project : many tasks relationship, filterable by either | — Pending |
| AI summary per task | Notes are freeform — AI makes them readable and consistent | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-10 after initialization*
