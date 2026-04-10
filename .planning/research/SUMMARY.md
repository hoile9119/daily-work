# Research Summary: Daily Work Summarizer

**Synthesized:** 2025-04-10
**Research files:** STACK.md · FEATURES.md · ARCHITECTURE.md · PITFALLS.md
**Overall confidence:** HIGH

---

## TL;DR

- **This tool is a Copilot CLI skill, not a standalone script.** Notion MCP uses OAuth 2.0 managed by the Copilot runtime — a standalone `node script.js` cannot authenticate without reimplementing the OAuth flow. Running the workflow as an AI agent inside a Copilot session means MCP is pre-authenticated AND Claude provides AI summarization for free (no OpenAI key needed).
- **The Notion API has no upsert.** Idempotency requires a local `state.json` ID cache + name-based lookup fallback, built from day one — not added later. Also: rich text blocks are capped at 2000 characters, and relation properties require page UUIDs, not name strings.
- **The markdown format is the load-bearing foundation.** Everything else (parser, Notion schema, AI summarization) depends on the format being finalized first. The recommended format: `## Project Name` headings, `- Task name | status` bullets, indented freeform notes.

---

## Stack Recommendation

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Node.js | 23.x | Already installed; native ESM |
| MCP SDK | `@modelcontextprotocol/sdk` | 1.29.0 | Stable v1.x only — v2 is pre-alpha until Q1 2026 |
| Notion MCP | `@notionhq/notion-mcp-server` | 2.2.1 | **Breaking change in v2.0:** `database_id` → `data_source_id`; tool names changed |
| Markdown parser | `unified` + `remark-parse` | 11.x | AST-based; handles edge cases regex won't |
| AI summarization | Claude (built-in) | — | Free inside Copilot session; no OpenAI key needed |
| Module format | ESM (`.mjs`) | — | Matches MCP ecosystem; no build step |
| Secrets | `.env` + `dotenv` | 16.x | `NOTION_TOKEN` for standalone fallback; not needed in Copilot skill mode |

**Critical version note:** `notion-mcp-server` v2.x changed all database operation tool names and parameter names. Use `query-data-source` (not `post-database-query`) and `data_source_id` (not `database_id`). Always call `listTools()` at runtime to verify exact tool names in use.

---

## Recommended Markdown Format

```markdown
# 2025-04-10

## Project Alpha

- Fix login bug | in-progress
  Traced to auth middleware. Token expiry not handled for refresh tokens.

- Write unit tests | done
  Covered happy path and 3 edge cases. Coverage at 87%.

## Project Beta

- Deploy to staging | done

- Review backlog | pending
  Blocked on PM to prioritize next sprint.
```

**Parsing rules:**

| Element | Syntax | Rule |
|---------|--------|------|
| Date (optional) | `# YYYY-MM-DD` | Ignored by parser; human reference only |
| Project | `## Project Name` (H2) | Everything below belongs to this project |
| Task + status | `- Task name \| status` | Pipe separates task from status; both required |
| Notes | Indented lines below task bullet | All indented lines concatenated as raw notes |
| No notes | Bullet only, no indented lines | Skip AI summarization; write placeholder |

**Status canonicalization:**

| Canonical | Also accepts |
|-----------|-------------|
| `new` | `New` |
| `in-progress` | `in progress`, `In Progress`, `inprogress` |
| `done` | `Done`, `complete`, `completed` |
| `pending` | `Pending`, `blocked` |

**Format design principles:** Fast to fill in (< 60 seconds), unambiguous to parse, human-readable without processing. Pipe-delimited status is the single structural rule — minimize syntax surface area to prevent parser brittleness.

---

## Phase Build Order

### Phase 1 — Markdown Format + Parser
**Why first:** Every other component depends on `ParsedWorklog` schema. Nothing can be built until the data model is locked.
- Finalize `today.md` format spec (this doc is the source of truth)
- Write AST-based parser using `unified` + `remark-parse`
- Write format validator with clear error messages (line numbers, expected vs found)
- Test against 5+ edge-case files: missing notes, missing status, extra blank lines, emoji in names, special chars in task names
- **Pitfalls to avoid:** Parser brittleness (Pitfall 5), special character breaks (Pitfall 13), format friction (Pitfall 12)

### Phase 2 — Notion Database Setup
**Why second:** Notion DB IDs (`projects_db_id`, `tasks_db_id`) must be known before any sync code runs. Schema decisions here are expensive to change later.
- Create Projects database (properties: Name/title, Created)
- Create Tasks database (properties: Name/title, Status/select, Summary/rich_text, Project/relation, Date/date)
- **Lock select option strings now:** `"new"`, `"in-progress"`, `"done"`, `"pending"` — written to constants before any sync code
- Store both DB IDs in `.planning/state.json`
- Test project → task relation link end-to-end before proceeding
- **Pitfalls to avoid:** Select option name drift (Pitfall 4), relation requires UUIDs not names (Pitfall 3)

### Phase 3 — Core Sync (Create-Only, No AI, No Upsert)
**Why third:** Prove the full data pipeline works before adding idempotency and AI complexity.
- Read parser output → create project pages → create task pages with relation
- No deduplication yet; no AI summary
- Manual test: run against `today.md`, verify Notion pages created with correct structure
- Add 200ms delay between Notion calls (rate limit insurance)
- Log full MCP responses — never swallow errors silently
- **Pitfalls to avoid:** MCP error opacity (Pitfall 6), rate limiting (Pitfall 7)

### Phase 4 — Upsert + State Cache (Idempotency)
**Why fourth:** Make sync safe to run multiple times per day. This is a correctness requirement, not a nicety.
- Implement `state.json` read/write with `{ projects: { name: id }, tasks: { "Project::Task": id } }` schema
- Decision tree per item: cached ID → use it; not cached → query by name → use found; not found → create + cache
- Handle 404 on cached ID: evict stale entry, fall back to name lookup
- Test: run twice, verify zero duplicate pages in Notion
- **Pitfalls to avoid:** Duplicate page creation (Pitfall 1), stale cache (Pitfall 10), 2000-char text truncation (Pitfall 2 — add `chunk_text(text, max=1900)` utility here)

### Phase 5 — AI Summarization + CLI Polish
**Why last:** Dropped cleanly into proven pipeline. UX polish also belongs here.
- Generate AI summary per task from notes (Claude built-in; free in Copilot session)
- Skip summarization if notes empty or < 50 chars; write `"No notes provided"` placeholder
- Anti-hallucination prompt instruction: "If notes are insufficient, return exactly: `[No sufficient notes to summarize]`. Do not invent details."
- Write summary to Notion `Summary` rich_text property (apply `chunk_text()` before write)
- Sync report output: "Synced 3 projects, 8 tasks. 5 created, 3 updated." — not raw JSON
- Single command invocation; run time target < 10 seconds
- **Pitfalls to avoid:** AI hallucination on sparse notes (Pitfall 8), tool abandonment via friction (Pitfall 12)

---

## Top Pitfalls to Avoid

| # | Pitfall | Phase | Prevention |
|---|---------|-------|------------|
| 1 | **No native Notion upsert** — every run creates duplicates without find-or-create | Phase 4 | State cache with UUID keys + name-based fallback query; never `create_page` without querying first |
| 2 | **2000-char hard limit on rich text** — AI summaries silently truncated | Phase 4 | `chunk_text(text, max=1900)` utility applied before every Notion write; prompt AI to stay under 1500 chars |
| 3 | **Relation needs page UUID, not name** — tasks created unlinked from day one | Phase 2 | `resolve_or_create_project(name)` helper returns UUID; cache project name → UUID mapping |
| 4 | **Select option case mismatch** — creates duplicate status options, breaks Notion filters | Phase 2 | Define status constants before writing sync code; validate parsed values against constants |
| 5 | **Parser brittleness on real-world input** — silent wrong data, no error shown | Phase 1 | AST-based parser (not regex); format validator with line numbers; test 5+ edge-case files |

**Additional moderate pitfalls:**
- MCP error opacity: always log full MCP response objects during development
- Rate limiting (3 req/s): add 200ms delay between sequential Notion calls
- Stale cache 404s: evict on not-found error and retry with name lookup
- AI hallucination: minimum-length check + anti-hallucination prompt guard

---

## Open Questions

| Question | Impact | Resolution |
|----------|--------|------------|
| Exact tool names in `notion-mcp-server` v2.2.1 | High — wrong tool name = silent failure | Call `listTools()` at runtime in Phase 3 and log the full list; don't hardcode until confirmed |
| Does the Copilot skill write `state.json` reliably via bash? | High — idempotency depends on cache persistence | Test in Phase 4: write cache file via bash tool, read back on next run, verify round-trip |
| How does Claude parse indented notes in `today.md`? | Medium — parser correctness | Validate in Phase 1 with deliberate edge-case inputs before building on top |
| MCP 429 error propagation | Medium — partial syncs leave Notion in inconsistent state | Test explicitly in Phase 3: what does the MCP layer surface when Notion rate-limits? |
| `today.md` special characters (colons, pipes in task names) | Low — parser edge case | Document escaping rule in format spec; test in Phase 1 |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|-----------|-------|
| Architecture (Copilot skill pattern) | HIGH | Direct inspection of `~/.copilot/mcp-config.json` — OAuth confirmed |
| Stack (package versions) | HIGH | All versions verified from npm registry on research date |
| notion-mcp-server v2 breaking changes | HIGH | Confirmed from official README |
| Markdown format design | HIGH | Well-understood domain; format is a design choice, not a discovery |
| Pitfalls 1–4 (Notion API facts) | HIGH | Official Notion API docs |
| MCP error behavior (Pitfall 6) | MEDIUM | Limited official MCP error propagation docs; behavior varies by server impl |
| AI summarization behavior | HIGH | Well-documented LLM patterns |
| Phase build order | HIGH | Dependencies are clear; order is deterministic given architecture |

---

## Sources

- `@notionhq/notion-mcp-server` README + npm registry (v2.2.1 breaking changes)
- `@modelcontextprotocol/sdk` v1.29.0 npm registry + GitHub
- Notion API Request Limits: https://developers.notion.com/reference/request-limits
- Direct inspection: `~/.copilot/mcp-config.json`, `~/.copilot/mcp-oauth-config/`
- `unified` + `remark-parse` v11.x npm registry
- Project context: `.planning/PROJECT.md`
