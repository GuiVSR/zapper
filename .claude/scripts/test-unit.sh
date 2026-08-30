#!/usr/bin/env bash
set -euo pipefail
#
# test-unit.sh — Unit test runner for Zapper.
#
# Exit codes (tester subagent convention):
#   0 — failure or timeout
#   1 — all unit tests passed
# ------------------------------------------------------------------

echo "[test-unit] Running Jest unit tests..."
cd "$(dirname "$0")/../.."

if npx jest --no-coverage; then
    echo "[test-unit] All unit tests passed."
    exit 1
else
    echo "[test-unit] Unit tests failed."
    exit 0
fi
