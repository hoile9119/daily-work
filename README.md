# Daily Work Summarizer

A personal productivity tool that reads a daily markdown log, uses AI to summarize your freeform notes, and syncs everything to Notion — automatically.

## How It Works

1. Fill in `today.md` with your projects and tasks
2. Open GitHub Copilot CLI and run `/daily-sync`
3. Your tasks appear in Notion with status, raw notes, and an AI-generated summary

```
today.md  →  parse  →  AI summarize  →  Notion sync
```

## Prerequisites

- [GitHub Copilot CLI](https://githubnext.com/projects/copilot-cli) with Notion MCP connected
- A Notion workspace with two databases set up (see Setup below)
- Node.js 18+

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/hoile9119/daily-work.git
cd daily-work
npm install
```

### 2. Connect Notion MCP

In Copilot CLI chat, type `/mcp` and follow the prompts to connect your Notion workspace. eg, re-auth to reconnect to Notion

### 3. Create Notion databases

In Copilot CLI chat, ask:

> "Create a Projects database and a Tasks database in Notion. Tasks should have a relation back to Projects, a Status select field (new / in progress / done / pending), a Date field, an AI Summary text field, and a Raw Notes text field."

Then save the database IDs to `.planning/state.json`:

```json
{
  "projectsDbId": "<projects-database-id>",
  "projectsDsId": "<projects-datasource-id>",
  "tasksDbId": "<tasks-database-id>",
  "tasksDsId": "<tasks-datasource-id>"
}
```

## Daily Usage

### 1. Fill in `today.md`

```markdown
## Daily Work Summarizer

- Parser tests | done
  Fixed edge case where tasks with no notes were dropped from the manifest.

- Notion sync | in progress
  The relation field now accepts the page URL format — stripped dashes are key.

## Platform Infra

- Deploy pipeline | done
  Updated GitHub Actions to use Node 20. All jobs green.

- Cost review | pending
  Waiting on billing export from finance team.
```

**Supported statuses** (flexible — many variants accepted):
| Write this... | Syncs as |
|---|---|
| `done`, `completed`, `finished` | `done` |
| `in progress`, `wip`, `doing` | `in progress` |
| `pending`, `blocked`, `waiting` | `pending` |
| `new`, `todo`, `not started` | `new` |

### 2. Run the sync

```
/daily-sync
```

The skill will:
- Parse `today.md`
- Generate a 2–4 sentence AI summary for each task's notes
- Create or update each task in Notion under the correct project

## Project Structure

```
daily-work/
├── today.md                  # Fill this in daily
├── today.template.md         # Format reference
├── src/
│   ├── parser.mjs            # Parses today.md → structured JSON
│   ├── normalizeStatus.mjs   # Maps status variants to canonicals
│   ├── syncPrep.mjs          # Reads today.md + state.json, outputs manifest
│   ├── parser.test.mjs       # 40 parser tests
│   └── syncPrep.test.mjs     # 12 sync prep tests
├── .github/skills/daily-sync/
│   └── SKILL.md              # Copilot CLI skill definition
└── .planning/
    └── state.json            # Notion DB IDs (gitignored, create manually)
```

## Running Tests

```bash
npm test
```

## Notes

- The skill runs inside Copilot CLI because Notion MCP authentication is session-managed — a standalone Node.js script cannot authenticate
- `state.json` is gitignored; each user sets up their own Notion databases
- Tasks are upserted by project + task name — safe to re-run on the same day
