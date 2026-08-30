#!/usr/bin/env bash
# reset-app-state.sh — Wipes application database and WhatsApp session data to restore clean state.
#
# Exit codes:
#   0 — Reset completed successfully
#   1 — Error occurred during reset

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "[reset] WARNING: This will delete all conversation history and WhatsApp session data."
echo "[reset] Proceed? (y/N)"
read -r response

if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    # 1. Stop all processes
    bash "$SCRIPT_DIR/cleanup-wweb.sh"

    echo "[reset] Wiping database and session data..."
    
    # 2. Wipe app data
    rm -rf tmp/db/
    rm -rf tmp/wweb_auth/
    rm -f tmp/whatsapp_state.json

    echo "[reset] Data wiped. Server is now in a fresh state."
    exit 0
else
    echo "[reset] Reset aborted."
    exit 1
fi
