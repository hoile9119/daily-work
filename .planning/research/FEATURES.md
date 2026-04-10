# Feature Landscape

**Domain:** Personal daily work logger / standup sync tool
**Researched:** 2025-01-15
**Confidence:** HIGH (personal tool — scope is clear and well-bounded)

---

## Table Stakes

Features users expect. Missing = the tool feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Reliable markdown parsing | The whole tool depends on it. Silent parse failures are catastrophic | Low | Must handle edge cases: missing notes, blank lines, extra spaces |
| Idempotent sync | Running the script twice must not create duplicate Projects or Tasks in Notion | Medium | Check by project/task name before creating; update if found |
| Status mapping | `new / in progress / done / pending` must map to a Notion select/status property exactly | Low | Case-insensitive parsing; normalize on the way in |
| AI summary per task | The core value-add over manual entry. Must produce concise, professional output | Low | Skip gracefully if notes are empty — write "No notes provided" |
| Clear error output | If parsing fails or Notion sync fails, the user must know why immediately | Low | Print which task/project failed, not just a stack trace |
| Run on demand, zero config friction | Script runs with `node sync.js` or similar — no env setup dance every time | Low | API keys in `.env`; Notion MCP already connected |

---

## Differentiators

Features that meaningfully improve daily usefulness without adding complexity.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dry-run / preview mode | Shows what _would_ be synced without touching Notion — builds trust, safe to experiment | Low | `--dry-run` flag; print a summary table to stdout |
| Date stamp on tasks | Records which day a task was logged; enables looking back at history in Notion | Low | Add a `Date` property to the Task entry using today's date |
| Raw notes preserved alongside AI summary | AI summary is readable, but raw notes are the ground truth — both should live in Notion | Low | Two separate Notion properties: `Notes (raw)` and `Summary (AI)` |
| Graceful empty-notes handling | Tasks with no notes are common mid-day. Don't crash or call AI with empty input | Low | Check before AI call; write a placeholder summary |
| Stdout summary after sync | Print "Synced 3 tasks across 2 projects" after a successful run — confirms it worked | Low | Simple console output, not a log file |

---

## Anti-Features

Things to deliberately **NOT** build. Explicitly listed to prevent scope creep.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Scheduled / cron execution | Adds ops complexity for zero benefit — the user decides when to sync | User runs the script manually |
| Web UI or dashboard | This is a personal CLI tool. A UI requires auth, hosting, maintenance | Notion IS the UI |
| Multi-file support (one file per project, etc.) | Discipline breaks down; parsing complexity increases; `today.md` is the contract | One file, one day, always `today.md` |
| Git / Jira / calendar integration | Pulls in data the user didn't intentionally write — noisy and unreliable | Markdown file is the only source of truth |
| Undo / rollback of Notion entries | Notion has its own history. Building rollback adds weeks of complexity | User edits Notion directly if needed |
| Progress metrics / streaks / dashboards | Feature bloat for a tool that must stay frictionless | Out of scope; Notion views cover this |
| Configuration wizard or interactive setup | Adds surface area; personal tool should just work after initial `.env` fill | Flat `.env` file for secrets only |
| Slack / Teams / email posting | Notion is the destination; posting elsewhere is a separate concern | Out of scope |
| Time tracking | No timestamps in the workflow; inferring time = guessing | Out of scope |
| Deleting Notion entries | Destructive ops on synced data are dangerous for a one-person tool | Only create/update, never delete |

---

## Markdown Format Recommendation

### Design Principles
1. **Fast to fill in** — minimal syntax, no boilerplate to remember
2. **Parseable without ambiguity** — `##` = project, `-` bullet = task, indented prose = notes
3. **Human-readable without processing** — the file should make sense if you open it without running the script
4. **Status is inline** — no separate YAML frontmatter; status lives with the task

### Recommended Format

```markdown
# 2025-01-15

## Project Alpha

- Fix login bug | in-progress
  Traced to auth middleware. Token expiry not handled for refresh tokens.
  Will fix tomorrow after standup.

- Write unit tests for auth module | done
  Covered happy path and 3 edge cases. Coverage at 87%.

## Project Beta

- Deploy to staging | done
  Deployed v1.2.3. All health checks green. No rollback needed.

- Review Jira backlog | pending
  Blocked waiting on PM to prioritize next sprint items.

## Project Gamma

- Set up local dev environment | new
```

### Parsing Rules

| Element | Syntax | Notes |
|---------|--------|-------|
| Date (optional) | `# YYYY-MM-DD` as H1 | Ignored by parser; for human reference |
| Project | `## Project Name` as H2 | Everything under it belongs to this project |
| Task + Status | `- Task name \| status` as bullet | Pipe separates task name from status |
| Notes | Indented line(s) below task bullet | All indented lines concatenated as notes |
| No notes | Bullet only, no indented lines | Parser skips AI call; writes placeholder |

### Status Values

| Canonical Value | Also Accepts |
|----------------|--------------|
| `new` | `New` |
| `in-progress` | `in progress`, `In Progress`, `inprogress` |
| `done` | `Done`, `complete`, `completed` |
| `pending` | `Pending`, `blocked` |

### Why This Format Over Alternatives

- **Not YAML frontmatter per task** — too verbose, breaks fast-entry flow
- **Not checkboxes `[ ]` / `[x]`** — binary only (done/not done), can't express `in-progress` or `pending`
- **Not a table** — tables in markdown are tedious to maintain as rows grow
- **Pipe separator for status** — visually clear, one character, unambiguous
- **Indented notes (not sub-bullets)** — multi-line notes flow naturally; sub-bullets would imply structure

---

## Feature Dependencies

```
Markdown parsing
  → Status normalization
  → AI summary (requires parsed notes)
  → Notion sync (requires parsed project/task/status + AI summary)
    → Idempotency check (requires Notion query before write)
    → Date stamp (requires today's date, trivial)
```

---

## MVP Feature Set

**Build these, in this order:**

1. Markdown parser (project → tasks → status → notes)
2. Status normalizer (canonical values)
3. AI summary per task (skip if no notes)
4. Notion sync — create Projects DB + Tasks DB, write entries
5. Idempotency — check existing before creating
6. Clear stdout output on completion

**Defer until validated:**
- Dry-run mode — useful but not required to prove the tool works
- Date stamping on tasks — easy add once schema is stable
- Raw notes as separate Notion property — add after first real-world use

---

## Sources

- Project context: `.planning/PROJECT.md`
- Existing `today.md` format observed (current ad-hoc numbered list — confirms format design is needed)
- Domain: personal standup/work logger tooling patterns (HIGH confidence — well-understood space)
