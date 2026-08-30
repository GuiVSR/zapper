# cURL Runbook

Every API endpoint in Zapper MUST have a corresponding cURL entry in this
runbook. A cURL entry is the canonical reference for an endpoint's behaviour —
method, URL, headers, and body. Request and response formats are validated
against these entries during contract testing.

---

## Conversations

### GET /api/conversations

List all conversation IDs.

```bash
curl -X GET 'http://localhost:3000/api/conversations' \
  --header 'Content-Type: application/json'
```

Expected response: `200` with JSON array of chatId strings (e.g. `["5511999888777", "5511988777666"]`).
Empty when no conversations exist: `[]`.

---

### GET /api/conversations/:chatId

Get a conversation by chat ID.

```bash
curl -X GET 'http://localhost:3000/api/conversations/5511999888777' \
  --header 'Content-Type: application/json'
```

Expected response: `200` with JSON object `{ chatId, messages: [...] }`.
For non-existent chats returns `{ chatId: "nonexistent", messages: [] }`.

---

### POST /api/conversations/:chatId/messages

Create or append a message to a conversation identified by chat ID.

```bash
curl -X POST 'http://localhost:3000/api/conversations/5511999888777/messages' \
  --header 'Content-Type: application/json' \
  --data '{
    "id": "c1-1",
    "timestamp": 1722278400000,
    "body": "Boa tarde, preciso de 500 caixas de papel\u00e3o para entrega",
    "type": "text",
    "senderType": "customer"
}'
```

Required fields: `id`, `body`, `type`, `senderType`.
Optional fields: `timestamp` (defaults to `Date.now()`), `message` (defaults to `body`), `transcription`, `description`.
If `messageId` already exists in the conversation, the message is replaced in place.
Expected response: `201` with the created message as JSON.
Missing required fields: `400` with `{ error: "Missing required fields: ..." }`.

---

### PATCH /api/conversations/:chatId/messages/:messageId

Update properties of an existing message.

```bash
curl -X PATCH 'http://localhost:3000/api/conversations/5511999888777/messages/c1-1' \
  --header 'Content-Type: application/json' \
  --data '{
    "body": "Boa tarde, preciso de 500 caixas de papel\u00e3o para entrega - urgente",
    "transcription": "transcribed audio text"
}'
```

Partial updates are supported — only provided fields are changed.
Expected response: `200` with the updated message as JSON.
Message not found: `404` with `{ error: "Message ... not found in conversation ..." }`.

---

## Sync

Sync routes are only registered when `WHATSAPP_ENABLED=true` and a `SyncEngine`
is wired. Without WhatsApp, these routes return 404.

### POST /api/sync/:chatId

Trigger a sync for a single WhatsApp chat. Uses the overlap-break algorithm:
fetches messages in growing windows, stops when overlap with stored messages is
detected.

```bash
curl -X POST 'http://localhost:3000/api/sync/5511999888777' \
  --header 'Content-Type: application/json'
```

Expected response: `200` with `{ chatId, processed: number, skipped: number }`.
Without WhatsApp enabled: `404`.

---

### POST /api/sync

Trigger a sync for all known WhatsApp chats.

```bash
curl -X POST 'http://localhost:3000/api/sync' \
  --header 'Content-Type: application/json'
```

Expected response: `200` with JSON array of `SyncResult` objects.
Without WhatsApp enabled: `404`.

---

### GET /api/sync/state/:chatId

Get the sync cursor and message count for a specific chat.

```bash
curl -X GET 'http://localhost:3000/api/sync/state/5511999888777' \
  --header 'Content-Type: application/json'
```

Expected response: `200` with `{ chatId, cursor: { lastMessageId, syncedAt } | null, messageCount }`.
Without WhatsApp enabled: `404`.

---

### GET /api/sync/state

Get sync state for all conversations.

```bash
curl -X GET 'http://localhost:3000/api/sync/state' \
  --header 'Content-Type: application/json'
```

Expected response: `200` with `Record<string, SyncState>` — chatId keys mapped to
`{ chatId, cursor, messageCount }` objects.
Without WhatsApp enabled: `404`.
