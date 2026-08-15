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
- `python3` available on PATH (for JSON parsing; no `jq` dependency)

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

---

### S8 — Sync single chat endpoint exists

The POST /api/sync/:chatId endpoint returns valid JSON. When WhatsApp is not
enabled, a 404 is expected and treated as a pass.

```bash
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST 'http://localhost:3000/api/sync/5511999999999')
# 200 (sync enabled) or 404 (sync disabled) both pass
```

**Pass**: HTTP status 200 with `{"chatId","processed","skipped"}` shape, or 404.
**Fail**: Any other status code, or 200 with invalid response shape.

---

### S9 — Sync all endpoint exists

The POST /api/sync endpoint returns a JSON array. When WhatsApp is not enabled,
a 404 is expected and treated as a pass.

```bash
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST 'http://localhost:3000/api/sync')
# 200 (sync enabled) or 404 (sync disabled) both pass
```

**Pass**: HTTP status 200 with JSON array, or 404.
**Fail**: Any other status code, or 200 with non-array response.

---

### S10 — Sync state endpoint exists

The GET /api/sync/state/:chatId endpoint returns valid JSON with cursor and
messageCount. When WhatsApp is not enabled, a 404 is expected and treated as a pass.

```bash
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  'http://localhost:3000/api/sync/state/5511999999999')
# 200 (sync enabled) or 404 (sync disabled) both pass
```

**Pass**: HTTP status 200 with `{"chatId","messageCount"}` shape, or 404.
**Fail**: Any other status code, or 200 with invalid response shape.

---

## Full smoke suite script

The smoke suite is implemented in `.claude/scripts/smoke.sh`. Run it with:

```bash
bash .claude/scripts/smoke.sh
```

Or against a custom server:

```bash
ZAPPER_URL=http://localhost:4000 bash .claude/scripts/smoke.sh
```

See `.claude/scripts/smoke.sh` for the full implementation. The script uses
`python3` for JSON parsing (no `jq` dependency) and follows the script
conventions in `.claude/runbooks/scripts.md`.

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
