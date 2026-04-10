---
name: daily-sync
description: Parse today.md and sync work entries to Notion with AI summaries
argument-hint: "[--date YYYY-MM-DD]"
allowed-tools: Bash, Read
---

<objective>
Parse today's work log (today.md), generate a concise AI summary for every task,
then upsert all projects and tasks to Notion — creating new pages or updating existing
ones without ever creating duplicates.

Pipeline:
1. Run `node src/syncPrep.mjs` to produce a JSON sync manifest
2. Generate summaries for all tasks (batch, before any Notion writes)
3. Pass 1 — resolve all projects: fetch Projects DB once, build name→pageId map, create any missing
4. Pass 2 — upsert all tasks: search by name+project, update if found / create if not
5. Print one line per task: [created|updated] Project / Task — status
</objective>

<context>
Arguments (pass through to syncPrep.mjs if provided): $ARGUMENTS
</context>

<process>

## Step 1: Run syncPrep.mjs to get the manifest

Run the following Bash command, forwarding any arguments (e.g. --date YYYY-MM-DD):

```bash
node src/syncPrep.mjs $ARGUMENTS
```

- If the command exits with code 1, print the stderr output and STOP. Do not proceed to Notion.
- If exit code 0, parse the JSON output. This is your sync manifest.
- The manifest has: date, projectsDsId, tasksDsId, projectsDbId, tasksDbId, projects[], tasks[], warnings[]
- If manifest.warnings[] is non-empty, print each warning prefixed with ⚠  but continue.

## Step 2: Generate AI summaries for all tasks (batch before any Notion writes)

For EVERY task in manifest.tasks[], generate a summary now — before touching Notion.

Use this exact prompt internally for each task (substitute values from the manifest):

```
Task: {task.name}
Status: {task.status}
Project: {task.project}
Raw Notes:
{task.notes || "(no notes)"}

Generate a concise professional summary (2–3 sentences).

STRICT RULES:
1. Only use information explicitly stated in the Raw Notes above. Do not infer, expand, or add context not present in the notes.
2. If Raw Notes is "(no notes)" or blank, output exactly: No notes provided.
3. Do not mention the task name or project name in the summary.
4. Write in past tense for "done" status, present tense for "in progress" or "new".
5. Output only the summary text — no labels, no prefixes, no quotes.
```

Store each summary mapped to its task (by index or name+project key). You will use these
in Step 4 when writing to Notion — do NOT call Notion before all summaries are ready.

## Step 3: Pass 1 — Resolve all projects (find or create)

Build a projectMap: { projectName → notionPageId }

3a. Fetch the entire Projects collection in one call:
```
notion-notion-fetch(id: "collection://1ada7935-933e-45fd-8f5a-f16593782046")
```
This returns all existing Project pages. For each result, extract the page name and ID.
Build: projectMap = { "Project Name" → "page-id-with-dashes" }

3b. For each project in manifest.projects[]:
  - If projectMap[project.name] exists → use that ID (no API call needed)
  - If NOT found → create it:
    ```
    notion-notion-create-pages({
      parent: { data_source_id: "1ada7935-933e-45fd-8f5a-f16593782046" },
      properties: {
        "Name": project.name
      }
    })
    ```
    Add the returned page ID to projectMap[project.name].

After Step 3, every project in the manifest has a resolved page ID in projectMap.

## Step 4: Pass 2 — Upsert all tasks (search → update or create)

For each task in manifest.tasks[]:

4a. Search for an existing task page:
```
notion-notion-search(query: task.name)
```
Filter the results:
- parent.database_id must match manifest.tasksDbId ("8af3f04db594408e830da0e5bf927d48")
- The page title must exactly match task.name (case-sensitive)
- The Project relation should match the resolved project page ID

If a matching page is found → existingPageId = that page's ID. Proceed to 4b (UPDATE).
If no match → proceed to 4c (CREATE).

**IMPORTANT:** Search results span the entire workspace. Always filter by parent.database_id
before acting on any result. If search returns no results or no result passes the filter,
treat it as "not found".

4b. UPDATE existing task page:

Prepare the rich_text blocks for Raw Notes (chunk at 2000 chars):
```javascript
// Each chunk becomes a separate object in the rich_text array
const chunks = [];
const text = task.notes;
for (let i = 0; i < text.length || chunks.length === 0; i += 2000) {
  chunks.push({ type: "text", text: { content: text.slice(i, i + 2000) || "" } });
}
```

Strip dashes from the project page ID for the relation URL:
```
const cleanProjectId = projectMap[task.project].replace(/-/g, '');
const projectRelationValue = `["https://www.notion.so/${cleanProjectId}"]`;
```

Call:
```
notion-notion-update-page({
  page_id: existingPageId,
  properties: {
    "Status": { "select": { "name": task.status } },
    "Raw Notes": { "rich_text": chunks },
    "Summary": { "rich_text": [{ "type": "text", "text": { "content": summaryForThisTask } }] },
    "date:Date:start": manifest.date,
    "date:Date:is_datetime": 0,
    "Project": projectRelationValue
  }
})
```

Print: `updated ${task.project} / ${task.name} — ${task.status}`

4c. CREATE new task page:

Use the same chunks and projectRelationValue from 4b.

Call:
```
notion-notion-create-pages({
  parent: { data_source_id: "c8680903-7a3e-4b16-9449-e8c9bc7283d2" },
  properties: {
    "Name": task.name,
    "Status": { "select": { "name": task.status } },
    "Raw Notes": { "rich_text": chunks },
    "Summary": { "rich_text": [{ "type": "text", "text": { "content": summaryForThisTask } }] },
    "date:Date:start": manifest.date,
    "date:Date:is_datetime": 0,
    "Project": projectRelationValue
  }
})
```

Print: `created ${task.project} / ${task.name} — ${task.status}`

## Step 5: Error handling

- If any Notion API call fails, print the error with the task context:
  `ERROR: [created|updated] ${task.project} / ${task.name}: <error message>`
  Then continue to the next task. Do not abort the entire sync on a single task failure.
- After processing all tasks, if there were any errors, print a summary:
  `Sync complete with N error(s). Check errors above.`
- If no errors: print nothing extra (the per-task lines are sufficient).

## Property format reference

| Field | Notion property | Write format |
|-------|----------------|--------------|
| Task name | Name (TITLE) | "Name": task.name |
| Status | Status (SELECT) | "Status": { "select": { "name": "in progress" } } |
| AI summary | Summary (RICH_TEXT) | "Summary": { "rich_text": [{ "type": "text", "text": { "content": "..." } }] } |
| Raw notes | Raw Notes (RICH_TEXT) | "Raw Notes": { "rich_text": chunks } (chunked at 2000 chars) |
| Date | Date (DATE) | "date:Date:start": "YYYY-MM-DD", "date:Date:is_datetime": 0 |
| Project relation | Project (RELATION) | "Project": `["https://www.notion.so/${pageIdNoDashes}"]` |

## Runtime verification notes

The following behaviors should be verified on first run and corrected if the MCP tool
responds differently than expected:

1. **notion-notion-update-page date format**: If `date:Date:start` flat key is rejected,
   try `"Date": { "date": { "start": "YYYY-MM-DD" } }` nested format instead.
2. **Search result shape**: Confirm that search results include `parent.database_id` for
   filtering. If not, use page URL prefix or another field to identify the parent DB.
3. **Collection fetch shape**: If `notion-notion-fetch("collection://...")` returns a
   different shape than expected, adapt the projectMap building logic accordingly.

Adapt the property write syntax based on what the MCP tools actually accept. The logic
and ordering of operations (batch summaries → projects → tasks) is fixed; only the exact
API call syntax may need adjustment.

</process>
