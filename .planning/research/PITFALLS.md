# Domain Pitfalls

**Domain:** Markdown → AI Summary → Notion sync (personal CLI tool)
**Researched:** 2025-01-10
**Confidence:** HIGH for Notion API facts (verified from official docs); MEDIUM for MCP-specific behavior (limited official MCP docs); HIGH for personal tool patterns (well-established community knowledge)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or project abandonment.

---

### Pitfall 1: Duplicate Page Creation (No Native Upsert in Notion)

**What goes wrong:** Every script run creates new Notion pages for the same project/task instead of updating existing ones. After a week of daily runs, Notion is flooded with duplicates.

**Why it happens:** The Notion API has no upsert operation. `create_page` always creates. Without an explicit "find or create" strategy, reruns multiply entries.

**Consequences:** Notion becomes unusable, user must manually clean up, trust in tool evaporates.

**Prevention:**
1. Before creating any Project or Task, query the database by title/name first.
2. Cache page IDs in a local `.notion-ids.json` file keyed by `(project_name, task_name, date)`.
3. If a matching page is found → `update_page`. If not found → `create_page`.
4. Use a unique "Date" property on Task pages (ISO date string) as a deduplication anchor — query `filter: { date: { equals: today } }` + title match.

**Warning signs:**
- Script doesn't do a `query_database` call before `create_page`
- No local ID cache file present
- Script is "append only" with no update path

**Phase:** Address in Phase 1 (Notion sync foundation) before any daily use begins.

---

### Pitfall 2: Notion Rich Text 2000-Character Limit Silently Truncates

**What goes wrong:** AI-generated summaries or raw notes longer than 2000 characters are silently rejected or truncated by the Notion API. Long-winded notes simply disappear.

**Why it happens:** Notion's API enforces `text.content` max = 2000 characters per rich text object (confirmed: [Notion Request Limits](https://developers.notion.com/reference/request-limits)). The Notion MCP may not surface this as a clear error.

**Consequences:** Summary stored in Notion is silently incomplete. User doesn't know content was dropped.

**Prevention:**
1. Chunk text that exceeds 2000 characters across multiple paragraph blocks (each block is a separate rich text object).
2. Apply chunking before calling any Notion MCP write tool — never pass raw AI output directly.
3. For summaries, prompt the AI to stay under 1500 characters to give headroom.

**Warning signs:**
- Notion page content is shorter than expected but no error is shown
- No text-length validation in the sync script
- AI prompt has no length instruction

**Phase:** Address in Phase 1 (Notion sync foundation). Implement a `chunk_text(text, max=1900)` utility early.

---

### Pitfall 3: Notion Relation Requires Page ID, Not Name

**What goes wrong:** Linking a Task to its parent Project requires the Project's Notion **page ID** (a UUID), not its name. If the script tries to set the relation using the project name string, the API call fails or silently ignores the relation.

**Why it happens:** Notion relation properties store references as `{ id: "<page_uuid>" }`. The project name is display-only. You must look up the ID via `query_database` first.

**Consequences:** All tasks are created unlinked — orphaned in the Tasks database with no project relation. The relational structure is broken from day one.

**Prevention:**
1. Always query the Projects database for a matching project name and extract `page.id` before creating tasks.
2. Cache the project name → page ID mapping locally (e.g., `.notion-ids.json`).
3. Write a dedicated `resolve_or_create_project(name)` helper that handles the lookup before any task write.

**Warning signs:**
- Script passes project name as a string to the relation property
- No Projects database query happens before Task creation
- Tasks appear in Notion with empty relation field

**Phase:** Address in Phase 1. The relation setup must be validated end-to-end before building on top of it.

---

### Pitfall 4: Notion Select Property Values Must Match Exactly

**What goes wrong:** The Task's `status` select property (new, in progress, done, pending) fails silently or errors if the string doesn't exactly match an existing Notion select option — including case, spaces, and hyphens.

**Why it happens:** Notion select properties allow creating new options dynamically when writing via the API, but if the database already has defined options, case mismatches (e.g., `"In Progress"` vs `"in progress"`) create a new duplicate option instead of using the existing one.

**Consequences:** Notion has 8 status options instead of 4. Filters and views break. Rollups are wrong.

**Prevention:**
1. Define the exact select option strings in a constants file and use them consistently: `STATUS = { new: "new", in_progress: "in progress", done: "done", pending: "pending" }`.
2. Document the exact Notion select option names in the project (or enforce them during DB creation).
3. Validate parsed status values against the constants before any Notion call.

**Warning signs:**
- Notion shows duplicate/variant status options in the select menu
- Status is written as a raw string from parsed markdown without normalization
- No constants file or enum for status values

**Phase:** Address in Phase 1 (DB schema design). Lock the select option strings before writing any sync code.

---

### Pitfall 5: Markdown Format Brittleness — Parser Breaks Silently

**What goes wrong:** The markdown parser makes implicit assumptions about heading levels, blank lines, or indentation. Slightly different formatting (a missing blank line, a `###` instead of `##`, a tab vs. space in a list) causes the parser to silently produce wrong data — wrong project assignments, missing tasks, or empty notes.

**Why it happens:** Regex-based or line-by-line parsers are fragile. "Works on my test file" ≠ "works after 3 weeks of real-world use." Humans fill in markdown inconsistently.

**Consequences:** Task data is incorrect. AI summarizes wrong content. Notion gets corrupted entries with no obvious error.

**Prevention:**
1. Design the markdown format to be as minimal and forgiving as possible — one structural rule, not five.
2. Write a format validator that runs before parsing and prints a clear error with line numbers: "Line 14: expected `## Task`, found `### Task`."
3. Test the parser against at least 5 different edge-case files (empty notes, missing status, extra blank lines, emoji in names).
4. Prefer a structured format (e.g., YAML front matter or clear delimiter blocks) over freeform prose with inline conventions.

**Warning signs:**
- Parser uses regex patterns like `^## (.+)` without handling `###`, `#`, or `**bold**` task names
- No validation step before parsing
- Parser was tested on exactly one sample file

**Phase:** Address in Phase 0 (format design). The format must be validated and battle-tested before the parser is written.

---

## Moderate Pitfalls

Cause bugs or friction, but recoverable without rewrites.

---

### Pitfall 6: MCP Layer Opacity — Errors are Unhelpful

**What goes wrong:** When Notion MCP calls fail, the error returned is often a generic MCP error, not the underlying Notion API error code. You see "tool call failed" instead of "rate_limited" or "validation_error: text exceeds 2000 chars."

**Why it happens:** MCP is an intermediary layer. The Notion MCP server translates API calls to tool calls, but error propagation varies by implementation. The `suekou/mcp-notion-server` uses experimental Markdown conversion that can cause additional silent failures on write operations.

**Prevention:**
1. Always log the full MCP response (including error details) during development — don't swallow errors.
2. Implement a thin error-checking wrapper around every MCP call.
3. Test failure cases explicitly: What does the MCP return when the page ID doesn't exist? When rate-limited?
4. Consider adding `NOTION_MARKDOWN_CONVERSION=false` (default) for write operations — markdown conversion is noted as "experimental" and can cause issues when editing content.

**Warning signs:**
- Script has `try/catch` but only logs `error.message`, discarding the full error object
- No test of what happens when MCP tools fail
- Errors in Notion sync silently skipped

**Phase:** Address in Phase 1 (Notion sync). Add logging from the very first MCP call.

---

### Pitfall 7: Notion Rate Limit — 3 Requests/Second Average

**What goes wrong:** Scripts that create multiple projects and tasks in a tight loop hit Notion's rate limit (3 requests/second average). The API returns HTTP 429. Unhandled 429s crash the script mid-run, leaving partial data in Notion.

**Why it happens:** For a daily file with 3 projects × 5 tasks = 15 tasks, plus project lookups, you might make 30–50 API calls in seconds. Each create, update, and query is a separate call.

**Consequences:** Partial sync — some tasks written, some not. Next run creates duplicates for the tasks that did get written.

**Prevention:**
1. The Notion SDK handles 429 retries automatically with exponential backoff. Ensure the MCP layer also respects this (verify — not guaranteed).
2. Add a deliberate delay (100–200ms) between sequential Notion operations if using MCP directly.
3. Batch related operations where possible (e.g., set all task properties in one `create_page` call, not multiple `update_page` calls).

**Warning signs:**
- Script fires API calls in a tight `for` loop without any delay
- No 429 handling or retry logic in the script
- Partial Notion data after a run

**Phase:** Address in Phase 1. Easy to add 200ms delays; cheap insurance.

---

### Pitfall 8: AI Hallucination on Empty or Sparse Notes

**What goes wrong:** When the `notes` field for a task is empty, very short ("done"), or cryptic jargon, the AI pads the summary with plausible-sounding but fabricated details — "Implemented the authentication module using JWT tokens" when the note was just "auth stuff."

**Why it happens:** AI models are trained to produce fluent, coherent output. When given insufficient input, they hallucinate to fill the gap.

**Consequences:** Notion contains inaccurate task summaries. Over time, you can't trust your own work log.

**Prevention:**
1. If notes field is empty or shorter than N characters, skip AI summarization and write the raw note as-is (or write a placeholder: "No notes provided").
2. Add to the AI prompt: "If the notes are insufficient to generate a factual summary, return exactly: `[No sufficient notes to summarize]`. Do not invent details."
3. Show the AI output to the user before writing to Notion (at least in early versions) so hallucinations are caught.

**Warning signs:**
- AI prompt doesn't include anti-hallucination instruction
- Script calls AI even when notes field is empty
- No minimum-length check on notes before AI call

**Phase:** Address in Phase 2 (AI summarization). The prompt design must include this guard.

---

### Pitfall 9: AI Token Cost Accumulates Faster Than Expected

**What goes wrong:** "It's just one call per task per day" — but with 10 tasks/day × 365 days, using GPT-4 at $0.03/1K tokens, you're spending $40–100/year on summaries for a personal tool. This is fine if budgeted, but surprises people.

**Why it happens:** Daily use compounds. Each call sends the system prompt + notes + response. Token counts are higher than they appear.

**Prevention:**
1. Use a lighter model for this task. GPT-4o-mini or Claude Haiku are 10–20× cheaper and more than capable of summarizing 200-word notes.
2. Set explicit `max_tokens` on the response (e.g., 150–200 tokens is plenty for a task summary).
3. Log token usage per run during development so you know the actual cost before it compounds.

**Warning signs:**
- Using GPT-4 / Claude Opus for task summaries with no justification
- No `max_tokens` parameter set on AI calls
- No token usage logging

**Phase:** Address in Phase 2 (AI summarization). Pick the model before the first integration.

---

### Pitfall 10: Stale Local ID Cache

**What goes wrong:** The script caches Notion page IDs locally (to avoid repeated lookups). A project gets renamed, deleted, or archived in Notion. The cache still has the old ID. Next run tries to update a non-existent page → silent failure or error.

**Why it happens:** Local cache is a snapshot. Notion is the source of truth. They diverge whenever the user edits Notion directly.

**Prevention:**
1. Cache IDs with a TTL or tie them to the current date — don't cache indefinitely.
2. On 404/not_found errors from Notion, evict the stale cache entry and retry with a fresh lookup.
3. Provide a `--reset-cache` flag that clears the ID cache and forces fresh lookups.

**Warning signs:**
- Cache file is written but never invalidated
- No 404 error handling in the update path
- No way to force a fresh lookup

**Phase:** Address in Phase 1 (upsert logic). Build eviction into the caching layer from day one.

---

## Minor Pitfalls

Annoying but low-impact.

---

### Pitfall 11: Pagination Blindness in Database Queries

**What goes wrong:** Notion database queries return max 100 results by default. If the Projects database grows beyond 100 entries, `query_database` silently returns only the first page. The project you're looking for is on page 2 — not found → duplicate created.

**Prevention:**
- For a personal tool, this is unlikely to matter in practice (< 100 projects).
- But add a comment in the code: "TODO: handle pagination if Projects database exceeds 100 entries."
- If using `next_cursor` pagination: check `has_more` on every response.

**Phase:** Note in Phase 1 as a known limitation. Don't implement pagination now; document the threshold.

---

### Pitfall 12: Personal Tool Abandonment Due to Friction

**What goes wrong:** The tool works, but filling in the markdown takes 5 minutes, running the script has 10 prompts, and output is 200 lines of debug text. After 2 weeks, you stop using it.

**Why it happens:** Personal tools die from friction, not technical failure. Every extra step is a tax on habit formation.

**Prevention:**
1. **Markdown format must be fast** — fill in under 60 seconds. Max 4 fields per task (project, task, status, notes). One-line entries must be valid.
2. **Script must be a single command** — `node sync.js` or `./sync`, not `node sync.js --config ~/.config/notion-sync/config.json --date $(date +%Y-%m-%d)`.
3. **Output must be readable in 5 seconds** — a summary at the end: "Synced 3 projects, 8 tasks. 1 created, 7 updated." Not 50 lines of JSON.
4. **Run time under 10 seconds** — if it takes longer, the user stops running it.

**Warning signs:**
- Markdown format requires more than 4 fields to be "valid"
- Script requires manual arguments for normal operation
- Script outputs raw API responses to console

**Phase:** Address in Phase 0 (format design) and Phase 3 (UX polish). Design for the lazy path first.

---

### Pitfall 13: Special Characters Breaking the Markdown Parser

**What goes wrong:** Task names or notes containing colons (`:`), hashes (`#`), pipes (`|`), or backticks cause the regex/parser to misidentify structure. A task named "Fix: auth bug #123" gets parsed as a heading with a task ID.

**Prevention:**
- Quote or escape task names in the format design (e.g., use a line prefix rather than inline punctuation for structure).
- Test parser with: colons in names, `#` in notes (issue references), emoji, parentheses, `/` in project names.

**Phase:** Address in Phase 0 (format design).

---

### Pitfall 14: Payload Size Limit When Appending Blocks

**What goes wrong:** Appending content to a Notion page is limited to 1000 block elements and 500KB per request (confirmed: Notion Request Limits docs). Long notes split into many blocks can exceed this in a single API call.

**Prevention:**
- Keep AI summaries concise (max 200 tokens output).
- Each Task entry should be a self-contained page, not an ever-growing appended document.

**Phase:** Note in Phase 1. The "one page per task, one summary field" design avoids this naturally.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 0: Markdown format design | Format too complex → abandonment (Pitfall 12, 13) | Design for the minimum viable daily entry; max 4 fields |
| Phase 0: Format design | Ambiguous structure → parser brittleness (Pitfall 5) | Write the validator before the parser; test 5 edge-case files |
| Phase 1: Notion DB setup | Select option name drift (Pitfall 4) | Define status constants before writing any sync code |
| Phase 1: Notion sync | Duplicate page creation (Pitfall 1) | Build find-or-create before append; never create without querying first |
| Phase 1: Notion sync | Relation broken (Pitfall 3) | Test project→task link end-to-end before moving to task sync |
| Phase 1: Notion sync | Text truncation (Pitfall 2) | Add `chunk_text()` utility in first commit; test with 3000-char input |
| Phase 1: Notion sync | Rate limiting (Pitfall 7) | Add 200ms delay between calls; log all MCP responses during dev |
| Phase 1: Upsert logic | Stale cache (Pitfall 10) | Implement cache with 404 eviction from day one |
| Phase 2: AI summarization | Hallucination on sparse notes (Pitfall 8) | Add minimum-length check + anti-hallucination prompt instruction |
| Phase 2: AI summarization | Token cost (Pitfall 9) | Choose lightweight model (GPT-4o-mini/Haiku); set max_tokens |
| Phase 3: UX polish | Friction → abandonment (Pitfall 12) | Single command, <10s runtime, 5-line summary output |
| Any phase | MCP error opacity (Pitfall 6) | Log full MCP error objects; never swallow errors silently |

---

## Sources

- **Notion Rate Limits:** https://developers.notion.com/reference/request-limits (3 req/s, Retry-After header, 429 handling) — HIGH confidence (official docs, verified 2025-01)
- **Notion Size Limits:** Same source — 2000 chars/rich-text-block, 1000 blocks/500KB per payload — HIGH confidence
- **Notion SDK Retry Behavior:** https://github.com/makenotion/notion-sdk-js README — 2 retries default, exponential backoff with jitter — HIGH confidence
- **Notion MCP Markdown Conversion Warning:** https://github.com/suekou/mcp-notion-server README — "experimental, may cause issues when editing" — MEDIUM confidence (3rd-party MCP implementation)
- **Personal Tool Abandonment Patterns:** Engineering blog consensus (IndieHackers, HN discussions) + personal tool post-mortems — MEDIUM confidence (community wisdom, not single source)
- **AI Hallucination on Sparse Input:** Well-documented LLM behavior across OpenAI, Anthropic docs — HIGH confidence
