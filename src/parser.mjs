import { unified } from "unified";
import remarkParse from "remark-parse";
import { fileURLToPath } from "url";
import { normalizeStatus, suggestStatus } from "./normalizeStatus.mjs";

/**
 * Recursively extract plain text from any remark AST node.
 * Returns "\n" for soft-break nodes so tight-list notes are preserved as newlines.
 * @param {object} node - remark AST node
 * @returns {string}
 */
function extractText(node) {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  if (node.type === "break") return "\n";
  if (node.type === "strong" || node.type === "emphasis" || node.type === "link") {
    return (node.children ?? []).map(extractText).join("");
  }
  if (node.children) return node.children.map(extractText).join("");
  return "";
}

/**
 * Parse a single list item into a Task and push it onto currentProject.tasks.
 * Errors go to the shared errors array.
 */
function parseListItem(item, currentProject, projects, errors) {
  const firstParagraph = item.children.find(c => c.type === "paragraph");
  if (!firstParagraph) return;

  // For tight lists, the task line and notes are in the SAME paragraph node,
  // separated by a soft break (\n). Split to isolate the task line from inlined notes.
  const fullText = extractText(firstParagraph);
  const lines = fullText.split("\n");
  const taskLine = lines[0];
  const inlinedNotes = lines.slice(1).map(l => l.trim()).filter(Boolean).join("\n");
  const line = firstParagraph.position.start.line;

  // Task before any project heading
  if (!currentProject) {
    errors.push({
      line,
      message: `Task at line ${line} appears before any project heading`,
      severity: "error",
      context: `- ${taskLine}`,
    });
    return;
  }

  // Missing | separator
  if (!taskLine.includes("|")) {
    errors.push({
      line,
      message: `Task at line ${line} is missing status separator (expected '- Task Name | status')`,
      severity: "error",
      context: `- ${taskLine}`,
    });
    return;
  }

  // Split on last | to handle task names containing | (defensive)
  const lastPipe = taskLine.lastIndexOf("|");
  const rawName = taskLine.slice(0, lastPipe).trim();
  const rawStatus = taskLine.slice(lastPipe + 1).trim();

  // Empty task name
  if (!rawName) {
    errors.push({
      line,
      message: `Task at line ${line} has no name before the '|' separator`,
      severity: "error",
      context: `- ${taskLine}`,
    });
    return;
  }

  // Empty status
  if (!rawStatus) {
    errors.push({
      line,
      message: `Task at line ${line} has no status after the '|' separator`,
      severity: "error",
      context: `- ${taskLine}`,
    });
    return;
  }

  // Normalize status
  const normalized = normalizeStatus(rawStatus);
  if (!normalized) {
    const suggestion = suggestStatus(rawStatus);
    errors.push({
      line,
      message: `Unknown status '${rawStatus}' at line ${line}. Did you mean: '${suggestion}'?`,
      severity: "error",
      context: `- ${taskLine}`,
    });
    return;
  }

  // Collect notes from two sources:
  // 1. Loose-list: extra paragraph children after the first (blank-line separated)
  // 2. Tight-list: lines after the first line in the task paragraph
  const noteParagraphs = item.children
    .filter(c => c.type === "paragraph")
    .slice(1)
    .map(p => extractText(p));

  const notes = [...noteParagraphs, inlinedNotes].filter(Boolean).join("\n\n");

  currentProject.tasks.push({
    name: rawName,
    status: normalized.canonical,
    rawStatus: normalized.rawStatus,
    notes,
    line,
  });
}

/**
 * Parse a daily worklog markdown file into a structured ParsedWorklog object.
 *
 * @param {string} markdownText - Raw markdown content of today.md
 * @param {string|null} dateOverride - ISO date string "YYYY-MM-DD", or null to use today
 * @returns {{ date: string, projects: Array, errors: Array }}
 */
export function parseWorklog(markdownText, dateOverride = null) {
  const date = dateOverride ?? new Date().toISOString().slice(0, 10);
  const tree = unified().use(remarkParse).parse(markdownText);

  const projects = [];
  const errors = [];
  let currentProject = null;

  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 2) {
      const name = extractText(node).trim();
      if (!name) {
        errors.push({
          line: node.position.start.line,
          message: `Empty project heading at line ${node.position.start.line}`,
          severity: "error",
          context: "##",
        });
        currentProject = null;
      } else {
        currentProject = { name, tasks: [] };
        projects.push(currentProject);
      }
    } else if (node.type === "list") {
      for (const item of node.children) {
        parseListItem(item, currentProject, projects, errors);
      }
    }
    // Ignore all other node types (top-level paragraphs, thematic breaks, etc.)
  }

  // Warn on projects with no tasks
  for (const project of projects) {
    if (project.tasks.length === 0) {
      errors.push({
        line: 0,
        message: `Project '${project.name}' has no tasks — it will not be synced`,
        severity: "warning",
        context: `## ${project.name}`,
      });
    }
  }

  return { date, projects, errors };
}

// Standalone CLI runner: node src/parser.mjs [filepath]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { readFileSync } = await import("fs");
  const filepath = process.argv[2] ?? "today.md";
  try {
    const text = readFileSync(filepath, "utf8");
    const result = parseWorklog(text);
    if (result.errors.length > 0) {
      const errs = result.errors.filter(e => e.severity === "error");
      const warns = result.errors.filter(e => e.severity === "warning");
      if (warns.length > 0) {
        process.stderr.write(
          `⚠  ${warns.length} warning(s):\n${warns.map(w => `  ${w.message}`).join("\n")}\n`
        );
      }
      if (errs.length > 0) {
        process.stderr.write(
          `✗  ${errs.length} error(s):\n${errs
            .map(e => `  Line ${e.line}: ${e.message}\n          → ${e.context}`)
            .join("\n")}\n`
        );
      }
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    process.stderr.write(`Cannot read file '${filepath}': ${err.message}\n`);
    process.exit(1);
  }
}
