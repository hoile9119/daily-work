// Status normalization map: raw input → canonical status
// All keys are lowercase; matching is case-insensitive on trimmed input.

const STATUS_MAP = new Map([
  // → "new"
  ["new", "new"],
  ["todo", "new"],
  ["to do", "new"],
  ["not started", "new"],
  ["open", "new"],
  ["backlog", "new"],

  // → "in progress"
  ["in progress", "in progress"],
  ["in-progress", "in progress"],
  ["in_progress", "in progress"],
  ["inprogress", "in progress"],
  ["wip", "in progress"],
  ["working", "in progress"],
  ["started", "in progress"],
  ["active", "in progress"],
  ["ongoing", "in progress"],
  ["doing", "in progress"],

  // → "done"
  ["done", "done"],
  ["complete", "done"],
  ["completed", "done"],
  ["finish", "done"],
  ["finished", "done"],
  ["closed", "done"],
  ["resolved", "done"],
  ["shipped", "done"],
  ["merged", "done"],

  // → "pending"
  ["pending", "pending"],
  ["blocked", "pending"],
  ["on hold", "pending"],
  ["on-hold", "pending"],
  ["onhold", "pending"],
  ["waiting", "pending"],
  ["paused", "pending"],
  ["deferred", "pending"],
]);

/**
 * Normalize a raw status string to one of: "new", "in progress", "done", "pending"
 * @param {string} raw - The raw status string from the markdown file
 * @returns {{ canonical: string, rawStatus: string } | null} - null if unknown
 */
export function normalizeStatus(raw) {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  const canonical = STATUS_MAP.get(key);
  if (canonical === undefined) return null;
  return { canonical, rawStatus: raw };
}

// Prefix hint table for suggestStatus
const SUGGEST_PREFIXES = [
  { prefixes: ["prog", "work", "act", "wip", "do", "start", "ongo"], canonical: "in progress" },
  { prefixes: ["compl", "fin", "clos", "ship", "merg", "resolv", "done"], canonical: "done" },
  { prefixes: ["block", "hold", "wait", "paus", "defer", "pend"], canonical: "pending" },
  { prefixes: ["todo", "not", "open", "back", "new"], canonical: "new" },
];

/**
 * Suggest the closest canonical status for an unknown raw string.
 * Used in error messages: "Did you mean: 'in progress'?"
 * @param {string} raw
 * @returns {string} - A canonical value or a list of all options
 */
export function suggestStatus(raw) {
  if (typeof raw !== "string") return "new, in progress, done, or pending";
  const lower = raw.trim().toLowerCase();
  for (const { prefixes, canonical } of SUGGEST_PREFIXES) {
    if (prefixes.some(p => lower.startsWith(p) || lower.includes(p))) {
      return canonical;
    }
  }
  return "new, in progress, done, or pending";
}
