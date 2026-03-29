# Zapper

A WhatsApp web client with AI-powered reply drafting. Messages from each customer are pooled for 10 seconds of silence, then sent to an LLM (Groq by default) which generates a draft reply for you to review, edit, or send with one click.

---

## Features

- 💬 WhatsApp Web interface in the browser
- 🤖 Automatic AI draft generation per conversation
- ✅ One-click send, or edit before sending
- 🔔 Browser tab badge showing number of pending drafts
- 📜 Chat history with the last 10 messages included as context for the AI

---

## Requirements

- Node.js 18+
- A WhatsApp account (personal or business)
- A [Groq](https://console.groq.com) API key (free)

---

## Installation

```bash
git clone https://github.com/GuiVSR/zapper
cd zapper
npm install
```

---

## Environment variables

Create a `.env` file in the project root:

```dotenv
# ── Groq (default LLM — free at console.groq.com) ────────────────────────────
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_MAX_TOKENS=250
GROQ_TEMPERATURE=0.7

# ── Optional: webhook URL to forward inbound messages to ──────────────────────
# WEBHOOK_URL=https://your-endpoint.com/webhook

# ── Optional: alternative LLMs (swap import in messageHandler.ts to use) ─────
# DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
# DEEPSEEK_MODEL=deepseek-chat
# DEEPSEEK_MAX_TOKENS=250
# DEEPSEEK_TEMPERATURE=0.7

# KIMI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
# KIMI_MODEL=moonshot-v1-8k
# KIMI_MAX_TOKENS=250
# KIMI_TEMPERATURE=0.7
```

### Available Groq models

| Model | Speed | Quality |
|---|---|---|
| `llama-3.3-70b-versatile` | Fast | Best (recommended) |
| `llama-3.1-8b-instant` | Very fast | Good |
| `mixtral-8x7b-32768` | Fast | Good for long conversations |

---

## Running the app

Zapper has two processes — a backend server and a frontend dev server. Run them in two separate terminals.

**Terminal 1 — Backend server** (WhatsApp connection + API + AI drafting):
```bash
npm run dev:server
```

**Terminal 2 — Frontend** (React UI):
```bash
npm run dev:frontend
```

Then open your browser at **http://localhost:3001**

> The backend runs on port 3000 and the frontend dev server on port 3001. The frontend proxies API and socket requests to the backend automatically.

---

## Connecting via WhatsApp QR code

1. Start both servers as described above
2. Open **http://localhost:3001** in your browser
3. A QR code will appear on screen
4. On your phone, open WhatsApp → **Settings** → **Linked Devices** → **Link a Device**
5. Scan the QR code with your phone's camera
6. Wait a few seconds — the QR code will disappear and your chats will load in the sidebar

Your session is saved locally in `.wwebjs_auth/` so you only need to scan once. If you get logged out, delete that folder and scan again.

---

## AI draft workflow

1. A customer sends you a message
2. Zapper waits **10 seconds** for more messages from the same customer (pooling window)
3. After 10 seconds of silence, the conversation (including the last 10 prior messages for context) is sent to Groq
4. A draft reply appears in the chat banner:
   - **✅ Send** — sends immediately with one click
   - **✏️ Edit** — loads the draft into the input box so you can tweak it first
   - **✕ Discard** — dismisses the draft
5. The browser tab icon shows the number of pending drafts across all chats

### Customising the AI prompt

Open `src/llm/groq.ts` and edit `DEFAULT_SYSTEM_PROMPT` to add your business context, tone of voice, language preferences, etc.

---

## Project structure

```
zapper/
├── src/
│   ├── server.ts              # Express + Socket.IO server
│   ├── client.ts              # WhatsApp Web client wrapper
│   ├── handlers/
│   │   └── messageHandler.ts  # Message logging, pooling, AI draft trigger
│   ├── llm/
│   │   ├── groq.ts            # Groq client (active)
│   │   ├── deepseek.ts        # DeepSeek client (alternative)
│   │   ├── kimi.ts            # Moonshot Kimi client (alternative)
│   │   └── gemini.ts          # Google Gemini client (alternative)
│   └── frontend/
│       ├── App.tsx            # Main React app
│       ├── App.css            # Styles
│       └── index.tsx          # React entry point
├── public/
│   └── index.html             # HTML shell
├── .env                       # Your environment variables (never commit this)
├── .gitignore
├── package.json
├── tsconfig.json
└── webpack.config.js
```

---

## Switching LLM provider

Each provider has its own file in `src/llm/`. To switch, change one line in `src/handlers/messageHandler.ts`:

```ts
// Change this import:
import { getGroqClient } from '../llm/groq';

// To any of these:
import { getDeepSeekClient } from '../llm/deepseek';
import { getKimiClient }     from '../llm/kimi';
import { getGeminiClient }   from '../llm/gemini';
```

And update the call inside `flushPool` accordingly.

---

## Common issues

**QR code not appearing**
- Make sure the backend server is running on port 3000
- Check the terminal for errors
- Try deleting `.wwebjs_auth/` and restarting

**"GROQ_API_KEY is not set"**
- Make sure your `.env` file exists in the project root
- Make sure `dotenv` is installed: `npm install dotenv`

**Chats not loading after connecting**
- WhatsApp Web can take 10–30 seconds to sync on first connection
- Refresh the page if chats don't appear after 30 seconds

**Session expired**
- Delete the `.wwebjs_auth/` folder and restart the server to get a new QR code