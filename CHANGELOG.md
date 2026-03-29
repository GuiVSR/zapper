# Changelog

All notable changes to Zapper will be documented here.

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
- Support for multiple LLM providers: Groq, DeepSeek, Moonshot Kimi, Google Gemini
- Bot commands: `/ping`, `/help`, `/status`, `/chats`
- Optional webhook forwarding for inbound messages
- Blue UI theme

---

---

*Zapper is built with whatsapp-web.js, Express, Socket.IO, and React.*