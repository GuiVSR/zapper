#!/usr/bin/env bash
# smoke.sh — Smoke test suite for Zapper.
#
# Exit codes (tester subagent convention):
#   0 — one or more smoke tests failed
#   1 — all smoke tests passed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

BASE_URL="${ZAPPER_URL:-http://localhost:3000}"
FAILURES=0
CHAT_ID="5511999999999"

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; FAILURES=$((FAILURES + 1)); }

echo "[smoke] Zapper smoke tests — $(date)"

# S1 — Server alive
echo "[smoke] S1: Server alive"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/conversations" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then pass "S1"; else fail "S1 (got $HTTP_CODE)"; fi

# S2 — Valid JSON
echo "[smoke] S2: Conversations is valid JSON"
if curl -s "$BASE_URL/api/conversations" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d,list)" 2>/dev/null; then
  pass "S2"
else
  fail "S2 (response is not a JSON array)"
fi

# S3 — Create message
echo "[smoke] S3: Create message"
SMOKE_ID="smoke-$(date +%s)"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/conversations/$CHAT_ID/messages" \
  --header 'Content-Type: application/json' \
  --data "{\"id\":\"$SMOKE_ID\",\"timestamp\":$(date +%s000),\"body\":\"smoke test\",\"type\":\"text\",\"senderType\":\"customer\"}" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "201" ]; then pass "S3"; else fail "S3 (got $HTTP_CODE)"; fi

# S4 — Read back message
echo "[smoke] S4: Read back message"
if curl -s "$BASE_URL/api/conversations/$CHAT_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert any(m['id'].startswith('smoke-') for m in d.get('messages',[]))
" 2>/dev/null; then
  pass "S4"
else
  fail "S4 (message not found)"
fi

# S5 — Update message
echo "[smoke] S5: Update message"
SMOKE_ID=$(curl -s "$BASE_URL/api/conversations/$CHAT_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['messages'][0]['id'])" 2>/dev/null || echo "")
if [ -n "$SMOKE_ID" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    -X PATCH "$BASE_URL/api/conversations/$CHAT_ID/messages/$SMOKE_ID" \
    --header 'Content-Type: application/json' \
    --data '{"body":"smoke test updated"}' 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then pass "S5"; else fail "S5 (got $HTTP_CODE)"; fi
else
  fail "S5 (could not get message ID)"
fi

# S6 — Reject invalid message
echo "[smoke] S6: Reject invalid message"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/conversations/$CHAT_ID/messages" \
  --header 'Content-Type: application/json' \
  --data '{"body":"missing fields"}' 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "400" ]; then pass "S6"; else fail "S6 (got $HTTP_CODE)"; fi

# S7 — Non-existent conversation returns empty
echo "[smoke] S7: Non-existent conversation returns empty"
if curl -s "$BASE_URL/api/conversations/0000000000000" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['chatId']=='0000000000000' and d['messages']==[]
" 2>/dev/null; then
  pass "S7"
else
  fail "S7"
fi

# S8 — Sync single chat (may 404 if WhatsApp not enabled)
echo "[smoke] S8: Sync single chat"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/sync/$CHAT_ID" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  if curl -s "$BASE_URL/api/sync/$CHAT_ID" -X POST | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'chatId' in d and 'processed' in d and 'skipped' in d
" 2>/dev/null; then
    pass "S8 (sync enabled — valid response)"
  else
    fail "S8 (sync enabled but invalid response shape)"
  fi
elif [ "$HTTP_CODE" = "404" ]; then
  pass "S8 (sync not enabled — 404 expected)"
else
  fail "S8 (got $HTTP_CODE)"
fi

# S9 — Sync all chats (may 404 if WhatsApp not enabled)
echo "[smoke] S9: Sync all chats"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/sync" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  if curl -s "$BASE_URL/api/sync" -X POST | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert isinstance(d,list)
" 2>/dev/null; then
    pass "S9 (sync enabled — valid array)"
  else
    fail "S9 (sync enabled but response is not an array)"
  fi
elif [ "$HTTP_CODE" = "404" ]; then
  pass "S9 (sync not enabled — 404 expected)"
else
  fail "S9 (got $HTTP_CODE)"
fi

# S10 — Sync state for a chat (may 404 if WhatsApp not enabled)
echo "[smoke] S10: Sync state"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  "$BASE_URL/api/sync/state/$CHAT_ID" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  if curl -s "$BASE_URL/api/sync/state/$CHAT_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'chatId' in d and 'messageCount' in d
" 2>/dev/null; then
    pass "S10 (sync enabled — valid state)"
  else
    fail "S10 (sync enabled but invalid state shape)"
  fi
elif [ "$HTTP_CODE" = "404" ]; then
  pass "S10 (sync not enabled — 404 expected)"
else
  fail "S10 (got $HTTP_CODE)"
fi

# Cleanup smoke data
rm -f tmp/db/${CHAT_ID}.json

# Verdict
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "[smoke] All smoke tests passed."
  exit 1
else
  echo "[smoke] $FAILURES smoke test(s) failed."
  exit 0
fi
