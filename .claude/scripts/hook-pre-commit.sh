#!/usr/bin/env bash
# hook-pre-commit.sh — PreToolUse hook for Bash.
# Fires when tool is "Bash" and command is "git commit".
# Runs unit tests. Blocks commit (exit 2) if tests fail.
#
# Hook exit codes:
#   0 — allow (not a git commit, or something else irrelevant)
#   1 — warn
#   2 — block (tests failed)

source "$(dirname "$0")/_log-execution.sh"

COMMAND=$(echo "$tool_input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null || echo "")

# Only act on git commit commands
if ! echo "$COMMAND" | grep -qE '^git commit'; then
    exit 0
fi

echo "[hook:pre-commit] git commit detected — running unit tests..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

if bash "$SCRIPT_DIR/test-unit.sh" > /dev/null 2>&1; then
    echo "[hook:pre-commit] Unit tests passed. Allowing commit."
    log_execution "hook-pre-commit.sh" "git commit with green tests" 0 "Bash" "PreToolUse"
    exit 0
else
    echo "[hook:pre-commit] BLOCKED: Unit tests failed. Fix tests before committing."
    log_execution "hook-pre-commit.sh" "git commit blocked by test failure" 2 "Bash" "PreToolUse"
    exit 2
fi
