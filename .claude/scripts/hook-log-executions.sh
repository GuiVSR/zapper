#!/usr/bin/env bash
# hook-log-executions.sh — Stop hook.
# Reads pending execution records from .claude/scripts/.pending-executions.jsonl,
# converts each to a memory JSON file in memory/executions/ per §1,
# then clears the pending log.
#
# Hook exit codes:
#   0 — processed (or nothing to do)
#   1 — warning (some records failed to save)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PENDING_FILE="$SCRIPT_DIR/.pending-executions.jsonl"
MEMORY_DIR="$REPO_ROOT/memory/executions"

# Nothing to do
if [ ! -f "$PENDING_FILE" ] || [ ! -s "$PENDING_FILE" ]; then
    exit 0
fi

mkdir -p "$MEMORY_DIR"
FAILURES=0
TOTAL=0

while IFS= read -r line; do
    [ -z "$line" ] && continue
    TOTAL=$((TOTAL + 1))

    # Parse fields from the JSONL record
    SCRIPT_NAME=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('script','unknown'))" 2>/dev/null || echo "unknown")
    TRIGGER=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('trigger',''))" 2>/dev/null || echo "")
    EXIT_CODE=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('exit_code',''))" 2>/dev/null || echo "")
    TIMESTAMP=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('timestamp',''))" 2>/dev/null || echo "")
    TOOL=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('context',{}).get('tool',''))" 2>/dev/null || echo "")
    EVENT=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('context',{}).get('event',''))" 2>/dev/null || echo "")

    # Build a safe ID from timestamp + script name
    SAFE_TS=$(echo "$TIMESTAMP" | tr ':' '-' | tr 'T' '-')
    SAFE_NAME=$(echo "$SCRIPT_NAME" | sed 's/\.sh$//')
    ENTRY_ID="exec-${SAFE_TS}-${SAFE_NAME}"

    # Determine exit code label
    case "$EXIT_CODE" in
        0) CODE_LABEL="allow/continue" ;;
        1) CODE_LABEL="warning" ;;
        2) CODE_LABEL="block" ;;
        *) CODE_LABEL="exit $EXIT_CODE" ;;
    esac

    # Build the memory entry
    BODY="Script \`$SCRIPT_NAME\` ran with exit code $EXIT_CODE ($CODE_LABEL). Trigger: $TRIGGER. Context: $EVENT hook on $TOOL tool."
    TITLE="$SCRIPT_NAME executed: $TRIGGER"

    MEMORY_JSON=$(python3 -c "
import json, sys
entry = {
    'id': '$ENTRY_ID',
    'kind': 'discovery',
    'title': '''$TITLE''',
    'body': '''$BODY''',
    'created': '$TIMESTAMP',
    'tags': ['execution', 'script', '${SAFE_NAME}'],
    'context': {
        'files': ['.claude/scripts/${SCRIPT_NAME}']
    }
}
print(json.dumps(entry, indent=2, ensure_ascii=False))
" 2>/dev/null)

    if [ -n "$MEMORY_JSON" ]; then
        echo "$MEMORY_JSON" > "$MEMORY_DIR/${ENTRY_ID}.json"
        echo "[hook:exec-log] Saved memory/executions/${ENTRY_ID}.json"
    else
        FAILURES=$((FAILURES + 1))
        echo "[hook:exec-log] FAILED to create memory entry for: $SCRIPT_NAME"
    fi
done < "$PENDING_FILE"

# Clear the pending log
> "$PENDING_FILE"

echo "[hook:exec-log] Processed $TOTAL execution record(s)."
if [ "$FAILURES" -gt 0 ]; then
    echo "[hook:exec-log] WARNING: $FAILURES record(s) failed to save."
    exit 1
fi
exit 0
