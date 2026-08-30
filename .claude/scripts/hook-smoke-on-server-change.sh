#!/usr/bin/env bash
# hook-smoke-on-server-change.sh — PostToolUse hook for Edit/Write.
# Fires after edits to src/server.ts. Runs smoke tests.
# Warns (exit 1) if smoke fails but does NOT block — smoke requires
# a running server, which may not be up.
#
# Hook exit codes:
#   0 — allow (server.ts not changed, or smoke passed)
#   1 — warn (smoke tests failed)

source "$(dirname "$0")/_log-execution.sh"

FILE_PATH=$(echo "$tool_input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_path',''))" 2>/dev/null || echo "")

if ! echo "$FILE_PATH" | grep -q 'src/server\.ts$'; then
    exit 0
fi

echo "[hook:smoke] src/server.ts edited — running smoke tests..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

# Smoke tests need a running server
if ! curl -s -o /dev/null 'http://localhost:3000/api/conversations' 2>/dev/null; then
    echo "[hook:smoke] WARNING: Server not running on :3000 — skipping smoke tests."
    log_execution "hook-smoke-on-server-change.sh" "server not running, smoke skipped" 1 "Edit/Write" "PostToolUse"
    exit 1
fi

if bash "$SCRIPT_DIR/smoke.sh" > /dev/null 2>&1; then
    echo "[hook:smoke] Smoke tests passed."
    log_execution "hook-smoke-on-server-change.sh" "smoke tests passed after server.ts edit" 0 "Edit/Write" "PostToolUse"
    exit 0
else
    echo "[hook:smoke] WARNING: Smoke tests failed. Review server.ts changes."
    log_execution "hook-smoke-on-server-change.sh" "smoke tests failed after server.ts edit" 1 "Edit/Write" "PostToolUse"
    exit 1
fi
