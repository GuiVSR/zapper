#!/usr/bin/env bash
# full-reset.sh — Destructive reset of the repository to clean state.
#
# Exit codes:
#   0 — Reset completed successfully
#   1 — Error occurred during reset

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "[reset] WARNING: This is a destructive operation."
echo "[reset] Reverting tracked files and removing all untracked files/directories."
echo "[reset] Proceed? (y/N)"
read -r response

if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "[reset] Resetting git state..."
    git reset --hard
    git clean -fdx
    
    echo "[reset] Reinstalling dependencies..."
    npm install
    
    echo "[reset] Full reset complete."
    exit 0
else
    echo "[reset] Reset aborted."
    exit 1
fi
