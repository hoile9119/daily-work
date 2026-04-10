# Requirements: Daily Work Summarizer

**Defined:** 2026-04-10
**Core Value:** Your daily work is captured once in a markdown file and automatically reflected in Notion — no manual Notion editing required.

## v1 Requirements

### Markdown Format

- [ ] **MDF-01**: `today.md` uses `## Project Name` headings to group tasks
- [ ] **MDF-02**: Tasks are listed as `- Task Name | status` bullets under their project heading
- [ ] **MDF-03**: Freeform notes are written as indented lines below each task bullet
- [ ] **MDF-04**: Status values accept human variants (e.g. "in progress", "in-progress", "wip") and canonicalize to: `new`, `in progress`, `done`, `pending`
- [ ] **MDF-05**: A starter `today.md` template is provided so the user knows the format

### Parser

- [ ] **PRSR-01**: Script parses `today.md` into a structured `ParsedWorklog` schema (project → tasks → notes)
- [ ] **PRSR-02**: Parser extracts project name, task name, status, and raw notes per task
- [ ] **PRSR-03**: Parser handles missing notes gracefully (task with no notes is valid)
- [ ] **PRSR-04**: Parser reports clear errors for malformed entries (bad status value, missing task name)

### Notion Database Setup

- [ ] **NDB-01**: Script creates a **Projects** Notion database with: Name (title), Description (text)
- [ ] **NDB-02**: Script creates a **Tasks** Notion database with: Name (title), Status (select: new/in progress/done/pending), Summary (text), Raw Notes (text), Date (date), Project (relation to Projects DB)
- [ ] **NDB-03**: Database IDs are stored locally (state cache) so setup only runs once
- [ ] **NDB-04**: Relations between Tasks and Projects use page UUIDs (not name strings)

### Sync

- [ ] **SYNC-01**: For each task in `today.md`, script finds or creates the matching Notion Task page (keyed on project + task name)
- [ ] **SYNC-02**: On re-run, existing tasks are updated (not duplicated)
- [ ] **SYNC-03**: Project pages are found-or-created by name before tasks are written
- [ ] **SYNC-04**: AI-generated summary is written to the Summary field of each task
- [ ] **SYNC-05**: Raw notes are written to the Raw Notes field (unmodified)
- [ ] **SYNC-06**: Text longer than 2000 characters is chunked into multiple Notion blocks before writing
- [ ] **SYNC-07**: Today's date is written to the Date field on each task

### AI Summarization

- [ ] **AI-01**: For each task with notes, Claude generates a concise professional summary (2-4 sentences)
- [ ] **AI-02**: Tasks with no notes receive a default summary: "No notes provided."
- [ ] **AI-03**: Summary prompt prevents hallucination (instructs Claude to only use what's in the notes)

### CLI Experience

- [ ] **CLI-01**: User runs a single command to trigger the full pipeline (parse → summarize → sync)
- [ ] **CLI-02**: Script completes in under 10 seconds for a typical day (5-10 tasks)
- [ ] **CLI-03**: Output is human-readable: one line per task showing name, status, and sync result (created/updated)
- [ ] **CLI-04**: Errors are printed clearly with enough context to fix them

## v2 Requirements

### Convenience

- **V2-01**: Dry-run mode (`--dry-run`) — shows what would be synced without writing to Notion
- **V2-02**: Date override (`--date 2026-04-09`) — sync a past day's file
- **V2-03**: Multi-day continuity — carry forward `in progress` tasks automatically

### Reporting

- **V2-01**: Weekly summary rollup from Notion data
- **V2-02**: Project-level progress view

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automatic scheduling / cron | User triggers manually; scheduler adds complexity and failure modes |
| Git / Jira / calendar integration | Markdown file is the only source; other integrations are v3+ |
| Web UI or dashboard | CLI is sufficient; web adds hosting and auth complexity |
| Multi-user support | Personal tool; no auth layer needed |
| Deleting Notion entries | Destructive operations excluded from personal daily tool |
| Rollback / undo | Out of scope for v1; append-only is safer |
| Slack / email posting | Out of scope; Notion is the single destination |
| Time tracking | Not part of the stated problem |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MDF-01 | Phase 1 | Pending |
| MDF-02 | Phase 1 | Pending |
| MDF-03 | Phase 1 | Pending |
| MDF-04 | Phase 1 | Pending |
| MDF-05 | Phase 1 | Pending |
| PRSR-01 | Phase 1 | Pending |
| PRSR-02 | Phase 1 | Pending |
| PRSR-03 | Phase 1 | Pending |
| PRSR-04 | Phase 1 | Pending |
| NDB-01 | Phase 2 | Pending |
| NDB-02 | Phase 2 | Pending |
| NDB-03 | Phase 2 | Pending |
| NDB-04 | Phase 2 | Pending |
| SYNC-01 | Phase 3 | Pending |
| SYNC-02 | Phase 3 | Pending |
| SYNC-03 | Phase 3 | Pending |
| SYNC-04 | Phase 3 | Pending |
| SYNC-05 | Phase 3 | Pending |
| SYNC-06 | Phase 3 | Pending |
| SYNC-07 | Phase 3 | Pending |
| AI-01 | Phase 3 | Pending |
| AI-02 | Phase 3 | Pending |
| AI-03 | Phase 3 | Pending |
| CLI-01 | Phase 3 | Pending |
| CLI-02 | Phase 3 | Pending |
| CLI-03 | Phase 3 | Pending |
| CLI-04 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial definition*
