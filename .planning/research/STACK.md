# Technology Stack

**Project:** Daily Work Summarizer CLI
**Researched:** 2025-01-10
**Overall confidence:** HIGH (all versions verified from npm registry and official repos)

---

## Recommended Stack

### Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 23.x (already installed) | Script runtime | Notion MCP server is npm-native; MCP SDK is TypeScript/Node.js only; no cross-runtime friction |
| ESM modules | native | Module format | `@notionhq/notion-mcp-server` ships `.mjs`; MCP SDK uses ESM exports; match the ecosystem |

**Node.js wins over Python because:**
- `@notionhq/notion-mcp-server` is an npm package — spawning it from Python requires cross-runtime subprocess juggling with no benefit
- `@modelcontextprotocol/sdk` (the MCP client library) is TypeScript-first; the Node.js client bindings are the canonical implementation
- No build step needed: run plain `.mjs` files with `node script.mjs` directly

**No TypeScript compilation required.** Plain `.mjs` files keep the personal script simple — no `tsc`, no `tsconfig.json`, no build step. Use JSDoc for type hints if needed.

---

### AI Summarization

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `openai` | 6.34.0 | LLM API client | gpt-4o-mini is the best price/performance ratio for simple summarization |
| Model: `gpt-4o-mini` | current | Text summarization | ~$0.15/1M input tokens; fast; no quality overkill for note summarization |

**OpenAI wins over alternatives because:**
- **vs Anthropic** (`@anthropic-ai/sdk` v0.87.0): Claude Haiku is comparable quality, but OpenAI's SDK has simpler `.chat.completions.create()` API shape with no extra parameters needed for basic use. Either works, OpenAI is slightly more ergonomic for a one-file script.
- **vs Ollama** (`ollama` v0.6.3): Local models require a running Ollama daemon and a downloaded model (multi-GB). Not worth the setup complexity for a personal summarizer. Output quality from llama3.2 is noticeably lower for structured writing.
- **vs Claude Sonnet/Opus or GPT-4o**: Gross overkill. Task is "make freeform bullet notes readable" — gpt-4o-mini handles this perfectly.

**Auth:** `OPENAI_API_KEY` environment variable — read at runtime, never hardcoded.

```js
// Minimal usage pattern
import OpenAI from "openai";
const ai = new OpenAI(); // reads OPENAI_API_KEY from env automatically
const result = await ai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: "Summarize these work notes concisely and professionally." },
    { role: "user", content: rawNotes }
  ]
});
const summary = result.choices[0].message.content;
```

---

### Markdown Parsing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `unified` | 11.0.5 | Markdown pipeline | Industry standard; produces traversable AST |
| `remark-parse` | 11.0.0 | Markdown → AST | Part of unified ecosystem; handles headers, lists, code blocks correctly |
| `unist-util-visit` | 5.x | AST traversal | Walk the syntax tree to extract sections by heading |

**Why unified/remark over alternatives:**
- **vs `marked`** (v18.0.0): `marked` renders markdown to HTML, not an AST. Extracting structured sections (e.g., "everything under `## Project X > ### Task Y`") from HTML is fragile regex work. The unified AST gives you direct node access.
- **vs `gray-matter`** (v4.0.3): `gray-matter` is for YAML frontmatter extraction only — useful as a complement if `today.md` uses frontmatter for date/metadata, but not sufficient for body parsing.
- **vs hand-rolled regex**: Regex on markdown breaks on edge cases (code blocks containing `##`, nested lists). Don't.

**Parsing pattern** for `## Project → ### Task → notes` structure:
```js
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";

const tree = unified().use(remarkParse).parse(markdownContent);
// Walk tree, collect headings and their following content blocks
```

---

### Notion Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@notionhq/notion-mcp-server` | 2.2.1 | MCP server (spawned as subprocess) | Project constraint: must use Notion MCP |
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP client (StdioClientTransport) | Stable 1.x SDK; v2.x is pre-alpha until Q1 2026 |
| `zod` | 3.25+ | Peer dependency of MCP SDK | Required; install alongside SDK |

**Critical: Use SDK v1.x, not v2.x.**
The MCP TypeScript SDK's `main` branch is v2 (pre-alpha). The published `@modelcontextprotocol/sdk` on npm is 1.29.0 — this is the stable version recommended for production. v2 splits into separate `@modelcontextprotocol/client` and `@modelcontextprotocol/server` packages. Do not use v2 until it stabilizes (estimated Q1 2026).

**Critical: notion-mcp-server v2.0.0 breaking changes.**
The server released v2.0.0 which migrates to Notion API `2025-09-03`. Breaking changes:
- `post-database-query` → `query-data-source` (parameter: `database_id` → `data_source_id`)
- `create-a-database` → `create-a-data-source`
- All database operations now use `data_source_id` instead of `database_id`
- Tool names changed: use `query-data-source`, `create-a-data-source`, `retrieve-a-data-source`

**Auth:** The server reads `NOTION_TOKEN` env var (an internal Notion integration token from https://www.notion.so/profile/integrations).

**Invocation pattern** — spawn the server as a stdio subprocess:

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@notionhq/notion-mcp-server"],
  env: {
    ...process.env,
    NOTION_TOKEN: process.env.NOTION_TOKEN,
  }
});

const client = new Client({ name: "daily-work-logger", version: "1.0.0" });
await client.connect(transport);

// List available tools
const { tools } = await client.listTools();

// Create a page in a Notion database
await client.callTool({
  name: "notion_create_page",  // verify exact tool name from listTools() at runtime
  arguments: {
    parent: { database_id: "<your-tasks-db-id>" },
    properties: { /* ... */ }
  }
});

await client.close();
```

**Note on remote MCP vs local subprocess:** Notion now offers a remote MCP server (OAuth-based, no token needed). However, for a personal script requiring `NOTION_TOKEN`, the local subprocess approach is more reliable and doesn't require browser OAuth flow. The remote option is better for Claude Desktop / Cursor integrations.

---

### Package Setup

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| npm | 10.9.0 (already installed) | Package manager | No reason to introduce pnpm/yarn for a personal script |
| `.env` file + `dotenv` | 16.x | Local secrets management | Keep `OPENAI_API_KEY` and `NOTION_TOKEN` out of shell history |

**Project structure:**

```
daily-work/
├── today.md              # Daily input file (filled in by user)
├── sync.mjs              # Main script (run this)
├── package.json          # type: "module", dependencies
├── .env                  # OPENAI_API_KEY, NOTION_TOKEN (gitignored)
├── .env.example          # Template (committed)
└── .gitignore
```

**package.json setup:**

```json
{
  "name": "daily-work-logger",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "sync": "node sync.mjs"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "dotenv": "^16.0.0",
    "openai": "^6.34.0",
    "remark-parse": "^11.0.0",
    "unified": "^11.0.5",
    "unist-util-visit": "^5.0.0",
    "zod": "^3.25.0"
  }
}
```

**Install:**

```bash
npm install
```

**Run:**

```bash
node sync.mjs
# or: npm run sync
```

No build step. No TypeScript compiler. No bundler. It's a personal script.

---

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

---

## Sources

- `@notionhq/notion-mcp-server` README: https://github.com/makenotion/notion-mcp-server (verified 2025-01-10)
  - Version 2.2.1 confirmed from npm registry
  - v2.0.0 breaking changes documented in README (database → data source migration)
  - `NOTION_TOKEN` env var auth pattern confirmed
- `@modelcontextprotocol/sdk` v1.29.0: npm registry + GitHub `modelcontextprotocol/typescript-sdk`
  - v2 confirmed as pre-alpha; v1.x is stable recommendation until Q1 2026
  - `StdioClientTransport` pattern confirmed from SDK exports (`./client` export)
- `openai` v6.34.0, `@anthropic-ai/sdk` v0.87.0: npm registry (verified)
- `unified` v11.0.5, `remark-parse` v11.0.0: npm registry (verified)
- User environment: Node.js v23.1.0, npm 10.9.0 (verified locally)
