#!/usr/bin/env bash
# hook-curl-runbook-check.sh — PostToolUse hook for Edit/Write.
# Fires after edits to src/server.ts. Warns if .claude/runbooks/curl.md
# was not also edited — indicating a possible missing cURL entry for a
# new or changed endpoint.
#
# Hook exit codes:
#   0 — allow (not server.ts, or curl.md also edited)
#   1 — warn (server.ts changed but curl.md not updated)

source "$(dirname "$0")/_log-execution.sh"

FILE_PATH=$(echo "$tool_input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_path',''))" 2>/dev/null || echo "")

if ! echo "$FILE_PATH" | grep -q 'src/server\.ts$'; then
    exit 0
fi

# Check if curl.md was also modified in the working tree
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

if git diff --name-only | grep -q '.claude/runbooks/curl.md' || \
   git diff --cached --name-only 2>/dev/null | grep -q '.claude/runbooks/curl.md'; then
    echo "[hook:curl-runbook] curl.md also updated. OK."
    log_execution "hook-curl-runbook-check.sh" "curl.md updated alongside server.ts" 0 "Edit/Write" "PostToolUse"
    exit 0
fi

echo "[hook:curl-runbook] WARNING: src/server.ts edited but curl.md not updated."
echo "[hook:curl-runbook] Per §5, new or changed endpoints require a cURL entry in .claude/runbooks/curl.md"
log_execution "hook-curl-runbook-check.sh" "server.ts edited without curl.md update" 1 "Edit/Write" "PostToolUse"
exit 1
