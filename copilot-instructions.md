<!-- GSD:project-start source:PROJECT.md -->
## Project

**Daily Work Summarizer**

A script-based daily work logger that reads a structured markdown file, uses AI to generate summaries from freeform notes, and syncs the results to Notion via MCP. Projects and tasks are organized in Notion with a parent-child relationship, and each task carries a status (new, in progress, done, pending).

**Core Value:** Your daily work is captured once in a markdown file and automatically reflected in Notion — no manual Notion editing required.

### Constraints

- **Integration**: Must use Notion MCP (already available in session) — no raw REST API calls
- **Input**: Single markdown file per day; format designed to be fast to fill in
- **AI**: Summaries generated from notes field — concise, professional tone
- **Scope**: Personal tool — no auth layer, no multi-tenant concerns
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Runtime
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 23.x (already installed) | Script runtime | Notion MCP server is npm-native; MCP SDK is TypeScript/Node.js only; no cross-runtime friction |
| ESM modules | native | Module format | `@notionhq/notion-mcp-server` ships `.mjs`; MCP SDK uses ESM exports; match the ecosystem |
- `@notionhq/notion-mcp-server` is an npm package — spawning it from Python requires cross-runtime subprocess juggling with no benefit
- `@modelcontextprotocol/sdk` (the MCP client library) is TypeScript-first; the Node.js client bindings are the canonical implementation
- No build step needed: run plain `.mjs` files with `node script.mjs` directly
### AI Summarization
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `openai` | 6.34.0 | LLM API client | gpt-4o-mini is the best price/performance ratio for simple summarization |
| Model: `gpt-4o-mini` | current | Text summarization | ~$0.15/1M input tokens; fast; no quality overkill for note summarization |
- **vs Anthropic** (`@anthropic-ai/sdk` v0.87.0): Claude Haiku is comparable quality, but OpenAI's SDK has simpler `.chat.completions.create()` API shape with no extra parameters needed for basic use. Either works, OpenAI is slightly more ergonomic for a one-file script.
- **vs Ollama** (`ollama` v0.6.3): Local models require a running Ollama daemon and a downloaded model (multi-GB). Not worth the setup complexity for a personal summarizer. Output quality from llama3.2 is noticeably lower for structured writing.
- **vs Claude Sonnet/Opus or GPT-4o**: Gross overkill. Task is "make freeform bullet notes readable" — gpt-4o-mini handles this perfectly.
### Markdown Parsing
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `unified` | 11.0.5 | Markdown pipeline | Industry standard; produces traversable AST |
| `remark-parse` | 11.0.0 | Markdown → AST | Part of unified ecosystem; handles headers, lists, code blocks correctly |
| `unist-util-visit` | 5.x | AST traversal | Walk the syntax tree to extract sections by heading |
- **vs `marked`** (v18.0.0): `marked` renders markdown to HTML, not an AST. Extracting structured sections (e.g., "everything under `## Project X > ### Task Y`") from HTML is fragile regex work. The unified AST gives you direct node access.
- **vs `gray-matter`** (v4.0.3): `gray-matter` is for YAML frontmatter extraction only — useful as a complement if `today.md` uses frontmatter for date/metadata, but not sufficient for body parsing.
- **vs hand-rolled regex**: Regex on markdown breaks on edge cases (code blocks containing `##`, nested lists). Don't.
### Notion Integration
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@notionhq/notion-mcp-server` | 2.2.1 | MCP server (spawned as subprocess) | Project constraint: must use Notion MCP |
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP client (StdioClientTransport) | Stable 1.x SDK; v2.x is pre-alpha until Q1 2026 |
| `zod` | 3.25+ | Peer dependency of MCP SDK | Required; install alongside SDK |
- `post-database-query` → `query-data-source` (parameter: `database_id` → `data_source_id`)
- `create-a-database` → `create-a-data-source`
- All database operations now use `data_source_id` instead of `database_id`
- Tool names changed: use `query-data-source`, `create-a-data-source`, `retrieve-a-data-source`
### Package Setup
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| npm | 10.9.0 (already installed) | Package manager | No reason to introduce pnpm/yarn for a personal script |
| `.env` file + `dotenv` | 16.x | Local secrets management | Keep `OPENAI_API_KEY` and `NOTION_TOKEN` out of shell history |
# or: npm run sync
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Runtime | Node.js | Python | Notion MCP server is npm-only; cross-runtime subprocess adds friction |
| AI | OpenAI gpt-4o-mini | Anthropic claude-3-5-haiku | Both work; OpenAI SDK slightly simpler API for basic completions |
| AI | OpenAI gpt-4o-mini | Ollama (local) | Requires running daemon + GB-scale model download; overkill for personal script |
| Markdown | unified + remark-parse | marked | `marked` outputs HTML, not AST; extracting sections is fragile |
| Markdown | unified + remark-parse | Hand-rolled regex | Regex breaks on edge cases in markdown |
| Notion | MCP via StdioClientTransport | `@notionhq/client` REST | Project constraint explicitly forbids raw REST calls |
| MCP SDK | `@modelcontextprotocol/sdk` v1.29.0 | v2 split packages | v2 is pre-alpha; no stable release until Q1 2026 |
| Package manager | npm | pnpm / yarn | No benefit for single-user personal script |
| Language | Plain `.mjs` | TypeScript | No build step needed; personal script doesn't benefit from type safety overhead |
## Sources
- `@notionhq/notion-mcp-server` README: https://github.com/makenotion/notion-mcp-server (verified 2025-01-10)
- `@modelcontextprotocol/sdk` v1.29.0: npm registry + GitHub `modelcontextprotocol/typescript-sdk`
- `openai` v6.34.0, `@anthropic-ai/sdk` v0.87.0: npm registry (verified)
- `unified` v11.0.5, `remark-parse` v11.0.0: npm registry (verified)
- User environment: Node.js v23.1.0, npm 10.9.0 (verified locally)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.github/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
