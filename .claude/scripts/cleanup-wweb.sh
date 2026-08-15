#!/usr/bin/env bash
# cleanup-wweb.sh — Cleans up zombie Chrome/Chromium processes, session locks, and orphaned server instances.
#
# Exit codes:
#   0 — Cleanup completed successfully
#   1 — Error occurred during cleanup

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "[cleanup] Starting Zapper WhatsApp Web and server cleanup..."

# 1. Kill orphaned server processes running dist/main.js
SERVER_PIDS=$(pgrep -f "node dist/main.js" || true)
if [ -n "$SERVER_PIDS" ]; then
    echo "[cleanup] Found orphaned server processes: $SERVER_PIDS"
    for PID in $SERVER_PIDS; do
        if [ "$PID" != "$$" ]; then
            echo "[cleanup] Killing server process PID: $PID"
            kill -9 "$PID" 2>/dev/null || true
        fi
    done
else
    echo "[cleanup] No orphaned server processes found."
fi

# 2. Kill zombie Chrome/Chromium processes associated with the session
BROWSER_PIDS=$(pgrep -f "tmp/wweb_auth/session" || true)
if [ -n "$BROWSER_PIDS" ]; then
    echo "[cleanup] Found zombie browser processes: $BROWSER_PIDS"
    for PID in $BROWSER_PIDS; do
        echo "[cleanup] Killing browser process PID: $PID"
        kill -9 "$PID" 2>/dev/null || true
    done
else
    echo "[cleanup] No zombie browser processes found."
fi

# 3. Release the Chrome session lock if it exists
LOCK_PATH="tmp/wweb_auth/session/SingletonLock"
if [ -e "$LOCK_PATH" ] || [ -L "$LOCK_PATH" ]; then
    echo "[cleanup] Browser session lock file found at: $LOCK_PATH"
    echo "[cleanup] Releasing session lock..."
    rm -f "$LOCK_PATH"
else
    echo "[cleanup] No browser session lock found."
fi

echo "[cleanup] Cleanup complete."
exit 0
