---
created: 2026-04-13T03:33:14.963Z
title: Fix daily-sync notion property format for text fields
area: tooling
files:
  - src/syncPrep.mjs
---

## Problem

When the daily-sync skill creates task pages in Notion, it initially passes rich_text objects (e.g. `{"rich_text": [{"text": {"content": "..."}, "type": "text"}]}`) for `Raw Notes` and `Summary` properties. However, the Notion `create-pages` tool only accepts plain string, number, or null values for properties — causing all 5 task creation attempts to fail with validation errors on first try.

The fix was applied manually during the session (switching to plain strings), but the skill's instructions or documentation should be updated to always use plain string values for `text`-type Notion properties.

## Solution

Update the daily-sync skill prompt/instructions to explicitly specify that Notion `text`-type properties (Raw Notes, Summary) must be passed as plain strings — not rich_text objects — when calling `create-pages` or `update-page`.
