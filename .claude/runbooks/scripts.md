# Script Creation Runbook

Procedures and conventions for creating, naming, and maintaining shell scripts
in `.claude/scripts/`. Every script in this directory must follow these rules.

---

## Core Directive

**Any process that fails or can be automated MUST trigger a suggestion to
create a script.** When a command fails, a manual step repeats, or a human
performs a task that a script could do, propose a `.sh` file that captures it.
The goal: no manual recovery step ever happens twice without being scripted.

---

## Script Categories

Scripts fall into one of these categories, each with its own naming prefix
and exit code convention.

### Test Scripts — `test-*.sh`

Runners for a specific test tier. Follow the tester subagent convention:

| Exit code | Meaning             |
|-----------|---------------------|
| `0`       | Failure or timeout  |
| `1`       | All tests passed    |

**Existing:** `test-unit.sh`

Test scripts are invoked by the tester subagent (see `.claude/runbooks/testing.md`).
They must self-locate the repo root and run without arguments.

### Hook Scripts — `hook-*.sh`

Attached to Claude Code lifecycle events in `.claude/settings.json`. Follow the
hook convention:

| Exit code | Meaning              |
|-----------|----------------------|
| `0`       | Allow / continue     |
| `1`       | Non-fatal warning    |
| `2`       | Block the action     |

**Existing:** `hook-pre-commit.sh`, `hook-smoke-on-server-change.sh`,
`hook-curl-runbook-check.sh`

Hook scripts receive context via environment variables set by the Claude Code
harness:
- `$tool_input` — JSON string of the tool's input
- `$tool_name` — name of the tool (e.g. "Edit", "Bash")
- `$tool_status` — "success" or "failure" (PostToolUse only)

Parse JSON from `$tool_input` with `python3 -c "import sys,json; ..."` when
structured data access is needed. Do not assume `jq` is installed.

### Utility Scripts — `<name>.sh`

General-purpose scripts: seed data generators, cleanup, smoke suites, build
helpers. No strict exit code convention — use standard Unix semantics (0 =
success, non-zero = error).

**Existing:** (none yet; candidates: `smoke.sh`, `seed-convo.sh`)

---

## Script Structure

Every script must include:

```bash
#!/usr/bin/env bash
# <name>.sh — <one-line description>
# <context: which hook, which test tier, what it replaces>
#
# Exit codes:
#   0 — <meaning>
#   1 — <meaning>
#   ...

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# <body>
```

### Rules

1. **Shebang**: `#!/usr/bin/env bash` (portable; works with any bash location).
2. **Header comment**: name, one-line purpose, exit code table.
3. **Self-locating**: use `SCRIPT_DIR` and `REPO_ROOT` — scripts are invoked from
   any working directory (hooks run from unknown CWD).
4. **No arguments**: scripts must run without CLI arguments. When config is
   needed, read it from environment variables or detect state from the repo.
5. **Idempotent**: running the same script twice in a row must not fail the
   second time because of state left by the first run.
6. **No dependencies beyond bash + POSIX**: do not assume `jq`, `yq`, `sd`, or
   other niche tools. Use `python3` for JSON parsing since it is guaranteed
   available in the Claude Code environment.

---

## When to Create a Script

| Trigger                             | Action                                            |
|-------------------------------------|---------------------------------------------------|
| A command fails during a procedure  | Script the fix so it never needs manual recovery  |
| A multi-step task is performed twice| Script it and reference it from the runbook       |
| A runbook step is error-prone       | Extract the step into a script, call it inline     |
| A hook needs logic beyond one-liner | Create `hook-*.sh` in `.claude/scripts/`          |
| A new test tier is added            | Create `test-*.sh` following the tester convention  |
| A manual data-seeding step repeats  | Create a utility script and fixture files         |

### Agent Behaviour

The Claude Code agent MUST proactively suggest a script when:

1. **A command fails** during a procedure: "Command X failed. Create a script
   that handles this recovery so it's automatic next time."
2. **A repeated manual step is observed**: "You ran the same sequence twice.
   Extract it into `.claude/scripts/<name>.sh`."
3. **A runbook procedure has 3+ manual shell commands**: "This runbook step
   has 3 shell commands. Should I script it?"

The suggestion must include: proposed filename, what the script replaces, and
which runbook it belongs to.

---

## Registering Scripts

After creating a script:

1. Make it executable: `chmod +x .claude/scripts/<name>.sh`
2. If it's a hook, register it in `.claude/settings.json` under the correct event
3. If it replaces a runbook step, update the runbook to reference the script
4. If it's a test script, update `.claude/runbooks/testing.md` with the new tier

---

## Script Index

| Script | Category | Purpose |
|---|---|---|
| `test-unit.sh` | Test | Run Jest unit tests with tester exit codes |
| `hook-pre-commit.sh` | Hook | Block `git commit` if unit tests fail |
| `hook-smoke-on-server-change.sh` | Hook | Run smoke tests after `src/server.ts` edits |
| `hook-curl-runbook-check.sh` | Hook | Warn if `src/server.ts` edited without `curl.md` update |
| `_log-execution.sh` | Utility (internal) | Shared logging function sourced by hook scripts |
| `hook-log-executions.sh` | Hook (Stop) | Consolidate pending execution records into memory entries |

---
## Execution Logging Pipeline

Every hook script execution is automatically logged to persistent memory via a
pipeline that spans the entire turn:

### Pipeline Diagram

```
Hook script
  └─ log_execution("hook-name.sh", "trigger", exit_code, tool, event)
      └─ append JSONL record → .pending-executions.jsonl

[End of turn]

Stop hook (hook-log-executions.sh)
  └─ read .pending-executions.jsonl
  └─ convert each record → memory/executions/{id}.json (MemoryEntry schema)
  └─ clear .pending-executions.jsonl
```

### Components

| Component | Path | Role |
|---|---|---|
| Shared logger | `.claude/scripts/_log-execution.sh` | `log_execution()` function — append one JSONL line |
| Pending queue | `.claude/scripts/.pending-executions.jsonl` | Temporary buffer for this turn's records |
| Stop hook | `.claude/scripts/hook-log-executions.sh` | Registered in `.claude/settings.json` under `Stop` |
| Memory output | `memory/executions/exec-*.json` | Persistent MemoryEntry files (gitignored) |

### JSONL Record Format (pending)

```json
{
  "script": "hook-pre-commit.sh",
  "trigger": "git commit detected",
  "exit_code": "2",
  "timestamp": "2026-08-02T12:00:00Z",
  "context": {
    "tool": "Bash",
    "event": "PreToolUse"
  }
}
```

### MemoryEntry Output Format

Each pending record is converted to a MemoryEntry with:

- `id`: `exec-{timestamp}-{script-name}` (e.g. `exec-2026-08-02T12-00-00Z-hook-pre-commit`)
- `kind`: `discovery`
- `tags`: `["execution", "script", "{script-name}"]`
- `body`: Human-readable summary of what happened and the exit code
- `context.files`: `[".claude/scripts/{script-name}"]`

### Adding Logging to a New Hook

```bash
source "$(dirname "$0")/_log-execution.sh"

# After determining the outcome:
log_execution "hook-my-check.sh" "trigger description" $exit_code "$tool_name" "$event_name"
```

The logger auto-detects the script's directory for the pending file. Call it
once per execution path — the Stop hook handles the rest.

### Race Conditions

The pipeline is safe under normal Claude Code operation:
- Bash `>>` append is atomic for small writes on Linux.
- The Stop hook fires only after all PostToolUse hooks complete.
- If no hooks fired during a turn, the pending file is empty and the Stop hook
  exits immediately.

### Recovery

If the Stop hook fails mid-processing, the pending file is NOT cleared (records
are consumed line-by-line; only a successful full pass truncates). On the next
turn, the Stop hook will re-process them. Deduplication is not enforced — check
by `id` if duplicate entries are a concern.
