// ─────────────────────────────────────────────────────────────────────────────
// constants.ts — single source of truth for all project-wide constants.
// Import from here instead of defining magic values inline.
// ─────────────────────────────────────────────────────────────────────────────

// ── Server ────────────────────────────────────────────────────────────────────
export const SERVER_PORT         = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// ── Frontend ──────────────────────────────────────────────────────────────────
export const API_BASE_URL        = 'http://127.0.0.1:3000';

// ── API defaults ──────────────────────────────────────────────────────────────
export const DEFAULT_HISTORY_LIMIT    = 50;  // messages fetched per chat history request
export const DEFAULT_SEARCH_LIMIT     = 50;  // messages returned per search request
export const DEFAULT_CHATS_LIMIT      = 10;  // chats returned by chats-with-messages endpoint
export const DEFAULT_SIDEBAR_CHATS    = 5;   // chats shown in the /chats command

// ── Message pooling ───────────────────────────────────────────────────────────
export const POOL_WINDOW_MS      = 10_000;  // wait this long after last message before drafting
export const HISTORY_CONTEXT     = 10;      // prior messages to include as AI context

// ── LLM — API base URLs ───────────────────────────────────────────────────────
export const GROQ_BASE_URL       = 'https://api.groq.com/openai/v1';
export const DEEPSEEK_BASE_URL   = 'https://api.deepseek.com';
export const KIMI_BASE_URL       = 'https://api.moonshot.cn/v1';
export const GEMINI_BASE_URL     = 'https://generativelanguage.googleapis.com/v1beta/models';

// ── LLM — default models ──────────────────────────────────────────────────────
export const GROQ_DEFAULT_MODEL      = 'llama-3.3-70b-versatile';
export const DEEPSEEK_DEFAULT_MODEL  = 'deepseek-chat';
export const KIMI_DEFAULT_MODEL      = 'moonshot-v1-8k';
export const GEMINI_DEFAULT_MODEL    = 'gemini-2.0-flash';

// ── LLM — default generation params ──────────────────────────────────────────
export const DEFAULT_TEMPERATURE     = 0.7;
export const DEFAULT_MAX_TOKENS      = 500;

// ── LLM — system prompt ───────────────────────────────────────────────────────
// Fallback used when SYSTEM_PROMPT is not set in .env
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful customer support assistant.
Respond in the same language the customer wrote in.
Keep replies concise and friendly.

[ADD YOUR BUSINESS CONTEXT AND INSTRUCTIONS HERE]`;

/**
 * Returns the active system prompt.
 * Priority: SYSTEM_PROMPT env var → DEFAULT_SYSTEM_PROMPT constant.
 * Set SYSTEM_PROMPT in your .env to override without touching code.
 */
export function getSystemPrompt(): string {
    return process.env.SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT;
}

// ── Favicon ───────────────────────────────────────────────────────────────────
export const FAVICON_SIZE        = 32;
export const FAVICON_COLOR       = '#2d7dd2';