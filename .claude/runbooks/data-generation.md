# Data Generation Runbook

Procedures for generating seed data and test fixtures in Zapper's `tmp/db/`
directory. Data is stored as JSON files — one per conversation — conforming to
the `Message` and `Conversation` types defined in `src/db/localDb.ts`.

---

## Data Model

### Message

```typescript
interface Message {
  id: string;          // Unique message ID (e.g. "msg-001")
  timestamp: number;   // Unix epoch milliseconds
  body: string;        // Display text
  message: string;     // Raw message content (defaults to body)
  type: string;        // "text" | "audio" | "image" | "sticker" | "gif" | "ptt"
  senderType: "customer" | "ai" | "human" | "ai-edited";
  transcription?: string;   // Audio transcription if type is "audio" or "ptt"
  description?: string;     // AI-generated summary or label
}
```

### Conversation

```typescript
interface Conversation {
  chatId: string;      // WhatsApp phone number (e.g. "5511999888777")
  messages: Message[];
}
```

A conversation is stored at `tmp/db/<chatId>.json` as an array of `Message`
objects. The `chatId` is sanitised: only `[a-zA-Z0-9_\-@.]` pass through;
everything else becomes `_`.

---

## Method A — Seed via API (canonical)

Use the `POST /api/conversations/:chatId/messages` endpoint. This is the
canonical path — every message flows through the same validation as production.

### Step 1: Start the server

```bash
npm run build && npm start
```

### Step 2: Seed a conversation

```bash
curl -X POST 'http://localhost:3000/api/conversations/5511999888777/messages' \
  --header 'Content-Type: application/json' \
  --data '{
    "id": "seed-1",
    "timestamp": 1722278400000,
    "body": "Boa tarde, preciso de orçamento para 500 caixas de papelão",
    "message": "Boa tarde, preciso de orçamento para 500 caixas de papelão",
    "type": "text",
    "senderType": "customer"
  }'
```

Repeat with different `id` values for each message. A complete seed script loops
over a fixture JSON array and POSTs each message.

### Complete seed script

```bash
#!/usr/bin/env bash
# seed-convo.sh — Seed a full conversation from a fixture JSON array.
# Usage: ./seed-convo.sh <chatId> <fixture.json>
set -euo pipefail

CHAT_ID="$1"
FIXTURE="$2"
BASE_URL="${ZAPPER_URL:-http://localhost:3000}"

# Read the fixture as a JSON array of messages and POST each one.
jq -c '.[]' "$FIXTURE" | while read -r msg; do
  curl -s -X POST "$BASE_URL/api/conversations/$CHAT_ID/messages" \
    --header 'Content-Type: application/json' \
    --data "$msg" > /dev/null
done

echo "[seed] Conversation $CHAT_ID seeded from $FIXTURE"
```

---

## Method B — Direct file write (bulk import)

For large datasets or offline generation, write JSON files directly.

### Step 1: Create the DB directory

```bash
mkdir -p tmp/db
```

### Step 2: Write a conversation file

```bash
cat > tmp/db/5511999888777.json << 'JSONEOF'
[
  {
    "id": "seed-1",
    "timestamp": 1722278400000,
    "body": "Boa tarde, preciso de orçamento",
    "message": "Boa tarde, preciso de orçamento",
    "type": "text",
    "senderType": "customer"
  },
  {
    "id": "seed-2",
    "timestamp": 1722278500000,
    "body": "Qual tipo de papelão? Temos kraft e duplex.",
    "message": "Qual tipo de papelão? Temos kraft e duplex.",
    "type": "text",
    "senderType": "human"
  }
]
JSONEOF
```

No server restart needed — the API reads files on every request.

---

## Fixtures

Fixture files live in `fixtures/` at the repo root. Each file is a JSON array
of `Message` objects.

### Minimal text-only fixture (`fixtures/minimal.json`)

```json
[
  {
    "id": "f1",
    "timestamp": 1722278400000,
    "body": "Olá, preciso de orçamento",
    "message": "Olá, preciso de orçamento",
    "type": "text",
    "senderType": "customer"
  },
  {
    "id": "f2",
    "timestamp": 1722278500000,
    "body": "Claro, qual produto?",
    "message": "Claro, qual produto?",
    "type": "text",
    "senderType": "human"
  }
]
```

### Multi-type fixture (`fixtures/multitype.json`)

```json
[
  {
    "id": "m1",
    "timestamp": 1722278400000,
    "body": "Olha esse modelo",
    "message": "Olha esse modelo",
    "type": "image",
    "senderType": "customer",
    "description": "Foto de caixa de papelão kraft"
  },
  {
    "id": "m2",
    "timestamp": 1722278500000,
    "body": "",
    "message": "",
    "type": "ptt",
    "senderType": "customer",
    "transcription": "Quero 500 unidades dessa caixa"
  },
  {
    "id": "m3",
    "timestamp": 1722278600000,
    "body": "OK, R$ 2,50 por unidade. Prazo 15 dias.",
    "message": "OK, R$ 2,50 por unidade. Prazo 15 dias.",
    "type": "text",
    "senderType": "ai",
    "description": "Cotação automática"
  }
]
```

---

## Cleanup

Remove all generated data:

```bash
rm -rf tmp/db/*
```

Remove specific conversation:

```bash
rm tmp/db/<chatId>.json
```
