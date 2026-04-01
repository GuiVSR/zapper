# Changelog

All notable changes to Zapper will be documented here.

## [1.7.0] — 2026-04-01

**Author:** GuiVSR

### tmp/ folder consolidation

#### Changed
- **`src/client.ts`** — stickers directory moved from `./stickers` (project root) to `tmp/stickers/`; both `tmp/` and `tmp/stickers/` are created automatically on startup if they don't exist
- **`src/llm/imageCache.ts`** — cache file moved from `.image-descriptions.json` (project root) to `tmp/.image-descriptions.json`; `tmp/` is created automatically on first import
- **`.gitignore`** — added `tmp/` so stickers, the image cache, and any other runtime artefacts are never committed; removed the now-redundant `stickers` entry

---

## [1.6.0] — 2026-04-01

**Author:** GuiVSR

### Persistent image description cache

#### Added
- **`src/llm/imageCache.ts`** — new module that stores AI-generated image descriptions keyed by WhatsApp message ID:
  - In-memory layer (`_cache`) loaded from disk exactly once on first access — all subsequent lookups are O(1) with zero disk I/O
  - `hasDescription(id)` — fast guard used before any vision API call to guarantee an image is never analysed twice
  - `getDescription(id)` — single-ID lookup
  - `getDescriptions(ids[])` — batch lookup for history enrichment
  - `saveDescription(id, desc)` — writes to memory and persists to disk immediately; no-op if value is unchanged
  - `cacheSize()` — returns entry count for logging
- **`enrichWithDescriptions()`** private method on `MessageHandler` — iterates history messages and for each image: checks cache first (instant hit), downloads + analyses only on a cache miss, saves result before continuing; called by both `flushPool` and `generateDraftsForChats`
- **`hasDescription()` guard in `handleInboundImage()`** — live incoming images also check the cache before downloading, so duplicate deliveries of the same image never trigger a second API call

#### Changed
- `flushPool()` and `generateDraftsForChats()` in `messageHandler.ts` now call `enrichWithDescriptions()` instead of the plain `getDescriptions()` map — history images with no cached description are analysed on the spot before the draft prompt is built
- Terminal now logs `[ImageCache] ✅ Cache hit for <id>` on reuse and `[ImageCache] Loaded N cached description(s) from disk` on server start

---

## [1.5.0] — 2026-04-01

**Author:** GuiVSR

### Image vision analysis

#### Added
- **`IMAGE_ANALYSIS_PROMPT`** constant in `src/constants.ts` — detailed extraction prompt that transcribes readable text verbatim and describes visual content with enough detail for an LLM to reproduce it
- **`analyzeImage(base64, mimeType, prompt?, messageId?)`** method on all three LLM clients:
  - **Groq** — uses `meta-llama/llama-4-scout-17b-16e-instruct` (vision-capable model, separate from the draft model)
  - **Gemini** — uses `inline_data` multimodal content block on the configured Gemini model
  - **DeepSeek** — returns a graceful fallback string (`[Image received — vision analysis not supported by DeepSeek]`)
- **`analyzeImage`** added to the `LLMClient` type in `src/llm/index.ts` with full signature `(base64, mimeType, prompt?, messageId?) => Promise<string>`
- **`handleInboundImage()`** private method on `MessageHandler` — extracted from `handleMessage` for clarity; downloads media, calls `analyzeImage`, saves description, then pools the message with description attached
- Image messages now enter the pool with `imageDescription` populated — previously they were silently dropped by the `type !== 'chat'` guard
- `poolMessage()` now sets `body` to `[image]` for image messages with no caption so pool entries are never blank in debug output

#### Changed
- `poolMessage()` — guard relaxed from `type !== 'chat'` to `type !== 'chat' && type !== 'image'` so image messages are pooled
- `generateWhatsAppDraft()` on all three LLM clients — conversation text builder now formats image messages as `[Customer] [sent an image]\n[Image description: ...]` instead of a blank line
- `messageHandler.ts` imports `saveDescription` and `getDescriptions` from `imageCache.ts`

---

## [1.4.0] — 2026-04-01

**Author:** GuiVSR

### Debug mode & LAN access

#### Added
- **`src/debug.ts`** — centralised debug logging module, enabled via `DEBUG=true` in `.env`:
  - `debugPrompt(provider, model, systemPrompt, conversationText, maxParts)` — prints the full system prompt and conversation context sent to the LLM, colour-coded by section
  - `debugResponse(provider, raw, parts)` — prints the raw LLM response and each parsed part
  - `debugImageAnalysis(provider, model, messageId, mimeType, prompt, description)` — prints the vision prompt and the resulting description
  - `debugLog(section, content)` — generic debug block for ad-hoc logging
- `DEBUG=true` / `DEBUG=false` env var — no code changes or special run commands needed; toggling the var and restarting is sufficient

#### Changed
- `generateWhatsAppDraft()` in `groq.ts`, `gemini.ts`, and `deepseek.ts` — calls `debugPrompt()` before the API request and `debugResponse()` after parsing
- `analyzeImage()` in `groq.ts` and `gemini.ts` — calls `debugImageAnalysis()` after receiving the vision result
- **`src/constants.ts`** — `API_BASE_URL` is now dynamic: `window.location.hostname:3000` in the browser so any hostname (localhost or LAN IP) resolves correctly without hardcoding
- **`webpack.config.js`** — dev server now binds to `host: '0.0.0.0'` so the frontend is reachable from other devices on the network
- **`src/server.ts`** — `server.listen()` now binds to `'0.0.0.0'` so the backend API and Socket.IO are reachable from LAN; startup log prints both Local and Network URLs

---

## [1.3.0] — 2026-03-30

**Author:** GuiVSR

### Provider switching & build fixes

#### Added
- **`LLM_PROVIDER` env var** — switch the active LLM provider without touching code. Valid values: `groq` (default) | `gemini` | `deepseek`
- **`src/llm/index.ts`** — server-only provider factory (`getLLMClient()`); kept separate from `constants.ts` so Webpack never tries to bundle Node.js modules into the frontend
- **`.vscode/settings.json`** — sets `js/ts.tsdk.path` to the workspace TypeScript so VS Code uses the project's TS version and correctly understands `ignoreDeprecations`

#### Changed
- `getLLMClient()` moved out of `constants.ts` into `src/llm/index.ts` — fixes Webpack bundling errors caused by `node-fetch` and Node.js built-ins (`node:fs`, `node:stream`, etc.) being pulled into the frontend build
- **`node-fetch` removed** from all LLM clients (`groq.ts`, `deepseek.ts`, `gemini.ts`) and `client.ts` — replaced with the global `fetch` built into Node.js 18+, eliminating the ESM/CJS conflict entirely
- `GEMINI_DEFAULT_MODEL` updated to `gemini-2.5-flash`
- `tsconfig.json` — added `"ignoreDeprecations": "6.0"` to silence the `moduleResolution=node10` deprecation warning in TypeScript 6+
- **Mark as read on send** — `WhatsAppClient.markChatAsRead()` added; called automatically after every `POST /api/send-message` so read receipts are sent and the unread badge clears instantly

#### Fixed
- Webpack build errors: `node:fs`, `node:stream`, `node:buffer`, `worker_threads` and related modules failing to resolve
- `TS1479` ESM/CJS conflict on `node-fetch` v3 imports across all LLM files
- `TS5107` deprecation warning for `moduleResolution=node10` in TypeScript 6

---

## [1.2.0] — 2026-03-30

**Author:** GuiVSR

### AI draft splitting & read receipts

#### Added
- **Draft splitting** — AI replies are now split into multiple separate WhatsApp message parts (default: 3). Each part appears as its own editable card in the draft banner with individual **✅ Send this** and **✕ remove** buttons
- **Parts input** in the sidebar toolbar — controls how many parts the AI should split its reply into (1–10); synced to the server in real time so the auto-pool also respects the setting
- **⊕ Merge button** — collapses all parts back into a single message when you decide one message is better
- **✅ Send all N** — sends each part as a separate WhatsApp message in sequence
- `POST /api/settings` endpoint — updates runtime settings (currently `maxDraftParts`) without triggering a generation, keeping the auto-pool in sync with whatever the UI shows
- **Mark as read on send** — clicking Send (manual, draft, or any part) now calls `chat.sendSeen()` on the server, sending blue double-tick read receipts and clearing the unread count instantly; the sidebar badge also zeroes out immediately in the UI
- `markChatAsRead()` public method on `WhatsAppClient` — wraps `chat.sendSeen()` for any chatId

#### Changed
- `AIDraft.draft: string` replaced by `AIDraft.parts: string[]` — always an array; single-part drafts have length 1
- `generateWhatsAppDraft()` on all LLM clients now returns `string[]` and accepts a `maxParts` parameter
- `DEFAULT_MAX_DRAFT_PARTS` in `constants.ts` set to **3**
- `getSystemPrompt(maxParts)` now accepts a `maxParts` argument: injects a JSON-array instruction when `> 1`, and an explicit plain-text-only instruction when `= 1`
- `MessageHandler.maxDraftParts` is now a public runtime property updated by both the API and the on-demand generation path
- `POST /api/generate-drafts` no longer mutates `process.env`

#### Fixed
- Draft banner was displaying raw JSON as a single string instead of parsed parts — `parsePartsResponse` now always attempts JSON parsing with four fallback strategies
- Parts input defaulting to 1 in the UI had no effect on auto-pooled drafts

---

## [1.1.0] — 2026-03-29

**Author:** GuiVSR

### On-demand AI draft generation & multi-chat selection

#### Added
- **Manual draft button** (`🤖`) in the input bar — generate an AI draft for the open chat at any time; always generates a single-part draft regardless of the Parts setting
- **Multi-chat selection mode** — toggle with the `☑ Select` button in the sidebar; check multiple chats and generate one draft per chat in a single action
- **Message limit input** in the sidebar toolbar — controls how many recent messages are sent to the AI for any generation (single or multi); defaults to `HISTORY_CONTEXT` from `constants.ts`
- `POST /api/generate-drafts` endpoint — accepts `{ chatIds, limit }` and fires async draft generation; results are delivered via the existing `ai_draft` socket event
- `generateDraftsForChats()` public method on `MessageHandler`

#### Changed
- `HISTORY_CONTEXT` in `constants.ts` is now the single source of truth for the default message limit
- `SYSTEM_PROMPT` env var added — overrides `DEFAULT_SYSTEM_PROMPT` without touching code
- All project-wide magic values centralised into `src/constants.ts`

---

## [1.0.0] — 2026-03-29

**Author:** GuiVSR

### 🎉 Zapper V1 — Initial Release

First working version of Zapper, a WhatsApp Web client with AI-powered reply drafting.

#### Added
- WhatsApp Web connection via QR code scan with session persistence
- Real-time chat sidebar with unread badges and live message updates
- Full chat history view with sent and received message bubbles
- Message pooling — inbound messages are grouped per customer over a 10-second silence window before triggering AI
- AI draft generation using **Groq** (Llama 3.3 70B) with the last 10 messages included as conversation context
- Draft review banner with three actions: **Send**, **Edit**, and **Discard**
- One-click send — approve a draft and send it without touching the keyboard
- Browser tab favicon showing a live count of pending AI drafts
- Support for multiple LLM providers: Groq, DeepSeek, Google Gemini
- Bot commands: `/ping`, `/help`, `/status`, `/chats`
- Optional webhook forwarding for inbound messages
- Blue UI theme

---

*Zapper is built with whatsapp-web.js, Express, Socket.IO, and React.*