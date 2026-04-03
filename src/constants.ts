// ─────────────────────────────────────────────────────────────────────────────
// constants.ts — single source of truth for all project-wide constants.
// ─────────────────────────────────────────────────────────────────────────────

// ── Server ────────────────────────────────────────────────────────────────────
export const SERVER_PORT         = 3002;

// ── Frontend ──────────────────────────────────────────────────────────────────
// Connects directly to the backend server (not through the webpack proxy).
// Uses the browser's hostname so it works from both localhost and network IPs.
export const API_BASE_URL = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`
    : `http://127.0.0.1:${SERVER_PORT}`;

// ── API defaults ──────────────────────────────────────────────────────────────
export const DEFAULT_HISTORY_LIMIT    = 50;
export const DEFAULT_SEARCH_LIMIT     = 50;
export const DEFAULT_CHATS_LIMIT      = 10;
export const DEFAULT_SIDEBAR_CHATS    = 5;

// ── Message pooling ───────────────────────────────────────────────────────────
export const POOL_WINDOW_MS      = 10_000;
export const HISTORY_CONTEXT     = 25;

// ── AI draft splitting ────────────────────────────────────────────────────────
export const DEFAULT_MAX_DRAFT_PARTS = 3;

export function getMaxDraftParts(): number {
    const val = parseInt(process.env.MAX_DRAFT_PARTS ?? '');
    return Number.isFinite(val) && val >= 1 ? val : DEFAULT_MAX_DRAFT_PARTS;
}

// ── Deepgram (audio transcription) ────────────────────────────────────────────
export const DEEPGRAM_BASE_URL   = 'https://api.deepgram.com/v1/listen';
export const DEEPGRAM_MODEL      = 'nova-2';

// ── LLM — API base URLs ───────────────────────────────────────────────────────
export const GROQ_BASE_URL       = 'https://api.groq.com/openai/v1';
export const DEEPSEEK_BASE_URL   = 'https://api.deepseek.com';
export const GEMINI_BASE_URL     = 'https://generativelanguage.googleapis.com/v1beta/models';

// ── LLM — default models ──────────────────────────────────────────────────────
export const GROQ_DEFAULT_MODEL      = 'llama-3.3-70b-versatile';
export const DEEPSEEK_DEFAULT_MODEL  = 'deepseek-chat';
export const GEMINI_DEFAULT_MODEL    = 'gemini-2.5-flash';

// ── LLM — default generation params ──────────────────────────────────────────
export const DEFAULT_TEMPERATURE     = 0.7;
export const DEFAULT_MAX_TOKENS      = 500;

// ── LLM — system prompt ───────────────────────────────────────────────────────
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful customer support assistant.
Respond in the same language the customer wrote in.
Keep replies concise and friendly.`;

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
export type LLMProvider = 'groq' | 'gemini' | 'deepseek';

// ── Image analysis ────────────────────────────────────────────────────────────
export const IMAGE_ANALYSIS_PROMPT = `* If there is readable text, transcribe it in full in the same language in which the text was written, respecting the sequence.
* If there are images or other objects, describe the visual content in maximum detail (objects, scenery, colors, position). Also respect the order — so if there is text followed by images, alternate the fully extracted text with the description. The description must be detailed enough to allow its reproduction by an LLM that will read the description and replicate it in HTML or image generation.
   1. Reproduce exactly all received text, without placeholders or suppressions. Do not fail to describe any visual element.`;

// ── Favicon ───────────────────────────────────────────────────────────────────
export const FAVICON_SIZE        = 32;
export const FAVICON_COLOR       = '#2d7dd2';