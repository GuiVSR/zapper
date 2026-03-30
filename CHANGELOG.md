# Changelog

All notable changes to Zapper will be documented here.

## [1.3.0] — 2026-03-30

**Author:** GuiVSR

### Provider switching & build fixes

#### Added
- **`LLM_PROVIDER` env var** — switch the active LLM provider without touching code. Valid values: `groq` (default) | `gemini` | `deepseek`
- **`src/llm/index.ts`** — server-only provider factory (`getLLMClient()`); kept separate from `constants.ts` so Webpack never tries to bundle Node.js modules into the frontend
- **`.vscode/settings.json`** — sets `js/ts.tsdk.path` to the workspace TypeScript so VS Code uses the project's TS version and correctly understands `ignoreDeprecations`

#### Changed
- `getLLMClient()` moved out of `constants.ts` into `src/llm/index.ts` — fixes Webpack bundling errors caused by `node-fetch` and Node.js built-ins (`node:fs`, `node:stream`, etc.) being pulled into the frontend build
- **`node-fetch` removed** from all LLM clients (`groq.ts`, `deepseek.ts`, `gemini.ts``) and `client.ts` — replaced with the global `fetch` built into Node.js 18+, eliminating the ESM/CJS conflict entirely
- `GEMINI_DEFAULT_MODEL` updated to `gemini-2.5-flash` (previous values `gemini-2.0-flash` and `gemini-2.5-flash-preview-04-17` are no longer available to new users)
- `tsconfig.json` — added `"ignoreDeprecations": "6.0"` to silence the `moduleResolution=node10` deprecation warning in TypeScript 6+
- **Mark as read on send** — `WhatsAppClient.markChatAsRead()` added; called automatically after every `POST /api/send-message` so read receipts are sent and the unread badge clears instantly

#### Fixed
- Webpack build errors: `node:fs`, `node:stream`, `node:buffer`, `worker_threads` and related modules failing to resolve — caused by `getLLMClient` being in `constants.ts` which is imported by the frontend
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
- `AIDraft.draft: string` replaced by `AIDraft.parts: string[]` — always an array; single-part drafts have length 1, preserving backwards-compatible behaviour when Parts = 1
- `generateWhatsAppDraft()` on all LLM clients (Groq, DeepSeek, Gemini) now returns `string[]` and accepts a `maxParts` parameter
- `DEFAULT_MAX_DRAFT_PARTS` in `constants.ts` set to **3** — default for new sessions
- `getSystemPrompt(maxParts)` now accepts a `maxParts` argument: injects a JSON-array instruction when `> 1`, and an explicit plain-text-only instruction when `= 1` to prevent the model returning accidental JSON
- `MessageHandler.maxDraftParts` is now a public runtime property updated by both the API and the on-demand generation path, so the auto-pool (10-second silence window) always uses the same value as the UI
- `POST /api/generate-drafts` no longer mutates `process.env` — `maxDraftParts` is now passed explicitly through the call chain, eliminating a concurrency race condition

#### Fixed
- Draft banner was displaying raw JSON (e.g. `["Boa tarde!", "..."]`) as a single string instead of parsed parts — `parsePartsResponse` now always attempts JSON parsing regardless of `maxParts`, with four fallback strategies: direct parse → double-encoded string parse → regex bracket extraction → blank-line paragraph split
- Parts input defaulting to 1 in the UI had no effect on auto-pooled drafts because the pool flush was reading `process.env.MAX_DRAFT_PARTS` (unset) instead of the UI-controlled value

---

## [1.1.0] — 2026-03-29

**Author:** GuiVSR

### On-demand AI draft generation & multi-chat selection

#### Added
- **Manual draft button** (`🤖`) in the input bar — generate an AI draft for the open chat at any time, without waiting for the automatic 10-second pool window
- **Multi-chat selection mode** — toggle with the `☑ Select` button in the sidebar; check multiple chats and generate one draft per chat in a single action
- **Message limit input** in the sidebar toolbar — controls how many recent messages are sent to the AI for any generation (single or multi); defaults to `HISTORY_CONTEXT` from `constants.ts` and can be overridden per-session in the UI
- `POST /api/generate-drafts` endpoint — accepts `{ chatIds, limit }` and fires async draft generation; results are delivered via the existing `ai_draft` socket event
- `generateDraftsForChats()` public method on `MessageHandler` — fetches history and calls Groq for each requested chat

#### Changed
- `HISTORY_CONTEXT` in `constants.ts` is now the single source of truth for the default message limit, used by both the pooling logic and the UI input initial value
- `SYSTEM_PROMPT` env var added — overrides `DEFAULT_SYSTEM_PROMPT` in `constants.ts` without touching code; all LLM clients read it via `getSystemPrompt()`
- All project-wide magic values centralised into `src/constants.ts` (API URLs, model names, pool window, limits, colours, favicon size, system prompt)

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