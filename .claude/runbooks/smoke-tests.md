# Smoke Tests Runbook

Smoke tests verify the system is alive and core pathways work. They run fast,
require no external dependencies (no WhatsApp client, no LLM), and answer one
question: "Is Zapper fundamentally broken right now?"

Every smoke test is a self-contained shell command. All must pass before any
other testing tier runs.

---

## When to run

- After server startup
- Before running integration or E2E tests
- After deployment
- After dependency upgrades

---

## Prerequisites

- Server running on `http://localhost:3000` (`npm run build && npm start`)
- `curl` available on PATH

---

## Smoke Tests

### S1 — Server is alive

The root health check confirms the Express server is listening.

```bash
curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3000/api/conversations'
```

**Pass**: HTTP status `200`.
**Fail**: Connection refused, timeout, or non-200 status.

---

### S2 — Conversations list is valid JSON

The response body is a valid JSON array (empty is fine — server must produce
well-formed output).

```bash
curl -s 'http://localhost:3000/api/conversations' | jq -e 'type == "array"'
```

**Pass**: `jq` exits 0 and prints `true`.
**Fail**: Invalid JSON, non-array response, or `jq` parse error.

---

### S3 — Create a message (write path)

The POST endpoint accepts a valid message and returns 201.

```bash
SMOKE_ID="smoke-$(date +%s)"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST 'http://localhost:3000/api/conversations/5511999999999/messages' \
  --header 'Content-Type: application/json' \
  --data "{\"id\":\"$SMOKE_ID\",\"timestamp\":$(date +%s000),\"body\":\"smoke test\",\"type\":\"text\",\"senderType\":\"customer\"}")
[ "$HTTP_CODE" = "201" ] && echo "PASS" || echo "FAIL: got $HTTP_CODE"
```

**Pass**: Prints `PASS`.
**Fail**: Non-201 status (400 = validation, 500 = server error).

---

### S4 — Read back created message (read path)

The GET endpoint returns the conversation with the message just created.

```bash
curl -s 'http://localhost:3000/api/conversations/5511999999999' | \
  jq -e '.messages | map(select(.id | startswith("smoke-"))) | length > 0'
```

**Pass**: `jq` exits 0 and prints `true`.
**Fail**: Message not found or response not valid JSON.

---

### S5 — Update a message (patch path)

The PATCH endpoint modifies an existing message.

```bash
SMOKE_ID=$(curl -s 'http://localhost:3000/api/conversations/5511999999999' | \
  jq -r '.messages[0].id')
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X PATCH "http://localhost:3000/api/conversations/5511999999999/messages/$SMOKE_ID" \
  --header 'Content-Type: application/json' \
  --data '{"body":"smoke test updated"}')
[ "$HTTP_CODE" = "200" ] && echo "PASS" || echo "FAIL: got $HTTP_CODE"
```

**Pass**: Prints `PASS`.
**Fail**: Non-200 status.

---

### S6 — Reject invalid message (validation)

POST with missing required fields returns 400.

```bash
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST 'http://localhost:3000/api/conversations/5511999999999/messages' \
  --header 'Content-Type: application/json' \
  --data '{"body":"missing fields"}')
[ "$HTTP_CODE" = "400" ] && echo "PASS" || echo "FAIL: got $HTTP_CODE"
```

**Pass**: Prints `PASS`.
**Fail**: Non-400 status (server not validating input).

---

### S7 — Non-existent conversation returns empty

GET on a conversation that never existed returns valid JSON with empty messages.

```bash
curl -s 'http://localhost:3000/api/conversations/0000000000000' | \
  jq -e '.chatId == "0000000000000" and .messages == []'
```

**Pass**: `jq` exits 0 and prints `true`.
**Fail**: Error status or non-empty response.

---

## Full smoke suite script

Save as `.claude/scripts/smoke.sh`:

```bash
#!/usr/bin/env bash
# smoke.sh — Smoke test suite for Zapper.
#
# Exit codes (tester subagent convention):
#   0 — one or more smoke tests failed
#   1 — all smoke tests passed
set -euo pipefail

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
if curl -s "$BASE_URL/api/conversations" | jq -e 'type == "array"' > /dev/null 2>&1; then
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
if curl -s "$BASE_URL/api/conversations/$CHAT_ID" | jq -e '.messages | map(select(.id | startswith("smoke-"))) | length > 0' > /dev/null 2>&1; then
  pass "S4"
else
  fail "S4 (message not found)"
fi

# S5 — Update message
echo "[smoke] S5: Update message"
SMOKE_ID=$(curl -s "$BASE_URL/api/conversations/$CHAT_ID" | jq -r '.messages[0].id')
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X PATCH "$BASE_URL/api/conversations/$CHAT_ID/messages/$SMOKE_ID" \
  --header 'Content-Type: application/json' \
  --data '{"body":"smoke test updated"}' 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then pass "S5"; else fail "S5 (got $HTTP_CODE)"; fi

# S6 — Reject invalid message
echo "[smoke] S6: Reject invalid message"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/conversations/$CHAT_ID/messages" \
  --header 'Content-Type: application/json' \
  --data '{"body":"missing fields"}' 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "400" ]; then pass "S6"; else fail "S6 (got $HTTP_CODE)"; fi

# S7 — Non-existent conversation returns empty
echo "[smoke] S7: Non-existent conversation returns empty"
if curl -s "$BASE_URL/api/conversations/0000000000000" | jq -e '.chatId == "0000000000000" and .messages == []' > /dev/null 2>&1; then
  pass "S7"
else
  fail "S7"
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
```

Make it executable after creation:

```bash
chmod +x .claude/scripts/smoke.sh
```

---

## Smoke test vs other test tiers

| Tier       | Scope                          | Prerequisites         |
|------------|--------------------------------|-----------------------|
| Smoke      | Server alive, CRUD works       | Server running        |
| Unit       | Single function, no I/O        | None                  |
| Integration| Module wiring, mocked network  | Database running      |
| E2E        | Full system, live WhatsApp     | WhatsApp authenticated|
| Contract   | API request/response shapes    | Server running        |

Smoke tests are the gatekeeper: if smoke fails, no other tier can pass.
