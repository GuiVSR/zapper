# Memory

This directory stores persistent memory entries as JSON files conforming to the
[MemoryEntry schema](../.claude/_template.md) defined in §1 of `CLAUDE.md`.

## What is memory?

Memory entries are structured, machine-readable records that survive across
sessions. They capture decisions, discoveries, rules, and references that are
not derivable from the code or git history alone. Tooling and agents read from
this directory to regain context without replaying old conversations.

## Directory Layout

```
memory/
├── README.md          ← this file
└── executions/        ← auto-generated: one entry per hook script execution
    └── exec-*.json
```

New subdirectories may be added for other entry kinds (decisions, references,
etc.). Each subdirectory should contain its own entries but no nested
directories — keep it flat per category.

## How entries are created

### Automatic: Execution Logging Pipeline

Every time a hook script runs (pre-commit, smoke, cURL check), its result is
logged automatically via the execution logging pipeline:

1. **Hook script** calls `log_execution()` (sourced from `_log-execution.sh`)
   which appends a one-line JSON record to `.claude/scripts/.pending-executions.jsonl`.
2. **Stop hook** (`hook-log-executions.sh`) fires at the end of every turn,
   reads all pending records, converts each to a MemoryEntry JSON file in
   `memory/executions/`, and clears the pending log.

Execution entries use `kind: "discovery"` and are tagged `["execution",
"script", "<script-name>"]`.

### Manual

To create a memory entry manually:

1. Choose a stable, kebab-case `id`.
2. Pick the correct `kind` (see table in `.claude/_template.md`).
3. Write a JSON file matching the MemoryEntry schema.
4. Place it in the appropriate subdirectory (or `memory/` root for uncategorized
   entries).

Example minimal entry:

```json
{
  "id": "why-we-use-json-store",
  "kind": "decision",
  "title": "File-based JSON store over SQLite",
  "body": "Chose flat JSON files in tmp/db/ so that data is portable, human-readable, and zero-config. Rejected SQLite because it adds a build dependency and migration burden for a single-tenant tool.",
  "created": "2026-08-02T00:00:00Z",
  "tags": ["architecture", "storage"]
}
```

## Git policy

Memory contents (`memory/*`) are gitignored. The directory structure and this
README are tracked. Memory entries are machine-generated or session-local —
committing them would create noise and merge conflicts across sessions.
