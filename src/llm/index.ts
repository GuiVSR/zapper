// ─────────────────────────────────────────────────────────────────────────────
// src/llm/index.ts — server-only LLM provider factory.
//
// Kept separate from constants.ts so Webpack never tries to bundle Node.js
// modules (node-fetch, node:fs, etc.) into the frontend build.
//
// Usage:  import { getLLMClient } from '../llm';
// Config: set LLM_PROVIDER in .env — groq | gemini | deepseek
//         Groq is the default when unset or unrecognised.
// ─────────────────────────────────────────────────────────────────────────────

import { LLMProvider } from '../constants';
import { getGroqClient }     from './groq';
import { getGeminiClient }   from './gemini';
import { getDeepSeekClient } from './deepseek';

export type LLMClient = {
    generateWhatsAppDraft: (messages: any[], maxParts: number) => Promise<string[]>;
};

export function getLLMClient(): LLMClient {
    const provider = (process.env.LLM_PROVIDER?.toLowerCase().trim() ?? 'groq') as LLMProvider;

    switch (provider) {
        case 'gemini':   return getGeminiClient();
        case 'deepseek': return getDeepSeekClient();
        case 'groq':
        default:         return getGroqClient();
    }
}