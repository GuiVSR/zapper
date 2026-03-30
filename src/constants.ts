// ─────────────────────────────────────────────────────────────────────────────
// constants.ts — single source of truth for all project-wide constants.
// Import from here instead of defining magic values inline.
// ─────────────────────────────────────────────────────────────────────────────

// ── Server ────────────────────────────────────────────────────────────────────
export const SERVER_PORT         = 3000;

// ── Frontend ──────────────────────────────────────────────────────────────────
export const API_BASE_URL        = 'http://127.0.0.1:3000';

// ── API defaults ──────────────────────────────────────────────────────────────
export const DEFAULT_HISTORY_LIMIT    = 50;  // messages fetched per chat history request
export const DEFAULT_SEARCH_LIMIT     = 50;  // messages returned per search request
export const DEFAULT_CHATS_LIMIT      = 10;  // chats returned by chats-with-messages endpoint
export const DEFAULT_SIDEBAR_CHATS    = 5;   // chats shown in the /chats command

// ── Message pooling ───────────────────────────────────────────────────────────
export const POOL_WINDOW_MS      = 10_000;  // wait this long after last message before drafting
export const HISTORY_CONTEXT     = 25;      // prior messages to include as AI context

// ── AI draft splitting ────────────────────────────────────────────────────────
// How many parts the AI should split its reply into (1 = no split).
// Can be overridden at runtime via the MAX_DRAFT_PARTS env var.
export const DEFAULT_MAX_DRAFT_PARTS = 3;

export function getMaxDraftParts(): number {
    const val = parseInt(process.env.MAX_DRAFT_PARTS ?? '');
    return Number.isFinite(val) && val >= 1 ? val : DEFAULT_MAX_DRAFT_PARTS;
}

// ── LLM — API base URLs ───────────────────────────────────────────────────────
export const GROQ_BASE_URL       = 'https://api.groq.com/openai/v1';
export const DEEPSEEK_BASE_URL   = 'https://api.deepseek.com';
export const KIMI_BASE_URL       = 'https://api.moonshot.cn/v1';
export const GEMINI_BASE_URL     = 'https://generativelanguage.googleapis.com/v1beta/models';

// ── LLM — default models ──────────────────────────────────────────────────────
export const GROQ_DEFAULT_MODEL      = 'llama-3.3-70b-versatile';
export const DEEPSEEK_DEFAULT_MODEL  = 'deepseek-chat';
export const KIMI_DEFAULT_MODEL      = 'moonshot-v1-8k';
export const GEMINI_DEFAULT_MODEL    = 'gemini-2.5-flash';

// ── LLM — default generation params ──────────────────────────────────────────
export const DEFAULT_TEMPERATURE     = 0.7;
export const DEFAULT_MAX_TOKENS      = 500;

// ── LLM — system prompt ───────────────────────────────────────────────────────
// Fallback used when SYSTEM_PROMPT is not set in .env
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful customer support assistant.
Respond in the same language the customer wrote in.
Keep replies concise and friendly.`;

/**
 * Returns the active system prompt, optionally injecting a splitting instruction.
 *
 * When maxParts > 1 the prompt tells the model to return a JSON array of strings
 * (one element per message part). When maxParts === 1 the model returns plain text
 * as before — no behaviour change for existing users who don't touch the setting.
 *
 * Priority for base prompt: SYSTEM_PROMPT env var → DEFAULT_SYSTEM_PROMPT constant.
 */
export function getSystemPrompt(maxParts: number = 1): string {
    const base = process.env.SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT;

    if (maxParts <= 1) {
        return `${base}

IMPORTANT — Reply format:
Return your reply as plain text only. Do NOT use JSON, arrays, or any special formatting.`;
    }

    return `${base}

IMPORTANT — Reply format:
You must split your reply into at most ${maxParts} separate WhatsApp messages.
Return your answer as a JSON array of strings, one string per message part.
Each part should be a self-contained, natural message — do not cut mid-sentence.
Do not include any text outside the JSON array.
Example for maxParts=3: ["Hello! Thanks for reaching out.", "Here is the information you need: ...", "Let me know if you have any questions!"]`;
}

// ── LLM — provider selection ──────────────────────────────────────────────────
// See src/llm/index.ts for getLLMClient() — kept server-side to avoid bundling
// Node.js modules into the frontend Webpack build.
export type LLMProvider = 'groq' | 'gemini' | 'deepseek';

// ── Favicon ───────────────────────────────────────────────────────────────────
export const FAVICON_SIZE        = 32;
export const FAVICON_COLOR       = '#2d7dd2';