// ─────────────────────────────────────────────────────────────────────────────
// src/llm/index.ts — server-only LLM provider factory.
// ─────────────────────────────────────────────────────────────────────────────

import { getDeepSeekClient } from './deepseek';

export type LLMClient = {
    generateWhatsAppDraft: (messages: any[], maxParts: number) => Promise<string[]>;
    analyzeImage: (base64Data: string, mimeType: string, prompt?: string, messageId?: string) => Promise<string>;
};

export function getLLMClient(): LLMClient {
    return getDeepSeekClient();
}
