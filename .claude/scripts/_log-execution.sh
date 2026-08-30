#!/usr/bin/env bash
# _log-execution.sh — sourced by hook scripts to log execution records.
# Writes a one-line JSON record to .claude/scripts/.pending-executions.jsonl.
# Processed at end-of-turn by hook-log-executions.sh (Stop hook).
#
# Usage (inside a hook script):
#   source "$(dirname "$0")/_log-execution.sh"
#   log_execution "hook-pre-commit.sh" "git commit detected" 0 "Bash" "PreToolUse"
#
# All arguments are strings. exit_code is the hook's exit code (0, 1, or 2).

log_execution() {
    local script_name="$1"
    local trigger="$2"
    local exit_code="$3"
    local tool_name="${4:-}"
    local event_name="${5:-}"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local log_dir
    log_dir="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
    local pending_file="$log_dir/.pending-executions.jsonl"

    python3 -c "
import json, sys
record = {
    'script': '$script_name',
    'trigger': '$trigger',
    'exit_code': '$exit_code',
    'timestamp': '$timestamp',
    'context': {
        'tool': '$tool_name',
        'event': '$event_name'
    }
}
print(json.dumps(record, ensure_ascii=False))
" >> "$pending_file"
}
