# Changelog

All notable changes to Zapper will be documented here.

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

*Zapper is built with whatsapp-web.js, Express, Socket.IO, and React.*