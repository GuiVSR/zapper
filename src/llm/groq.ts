import fetch from 'node-fetch';
import { GROQ_BASE_URL, GROQ_DEFAULT_MODEL, DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS, getSystemPrompt, getMaxDraftParts } from '../constants';

export interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface GroqRequest {
    model: string;
    messages: GroqMessage[];
    temperature?: number;
    max_tokens?: number;
}

interface GroqResponse {
    id: string;
    choices: Array<{
        message: GroqMessage;
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    error?: {
        message: string;
        type: string;
        code: string;
    };
}

class GroqClient {
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model = GROQ_DEFAULT_MODEL) {
        if (!apiKey) throw new Error('Groq API key is required.');
        this.apiKey = apiKey;
        this.model = model;
    }

    private async post(
        messages: GroqMessage[],
        options?: { temperature?: number; max_tokens?: number; model?: string }
    ): Promise<string> {
        const payload: GroqRequest = {
            model:       options?.model       ?? this.model,
            messages,
            temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
            max_tokens:  options?.max_tokens  ?? DEFAULT_MAX_TOKENS,
        };

        const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json() as GroqResponse;

        if (!response.ok) {
            const msg = data.error?.message ?? `HTTP ${response.status}`;
            if (response.status === 401) throw new Error(`Invalid Groq API key: ${msg}`);
            if (response.status === 429) throw new Error(`Groq rate limit exceeded: ${msg}`);
            throw new Error(`Groq API error: ${msg}`);
        }

        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('Groq returned an empty response.');
        return content;
    }

    /** Send a full message history and get a reply. */
    async getResponseFromHistory(
        chatHistory: GroqMessage[],
        options?: { temperature?: number; max_tokens?: number; model?: string }
    ): Promise<string> {
        return this.post(chatHistory, options);
    }

    /** Convenience: system prompt + flat message list. */
    async getResponseWithSystem(
        systemPrompt: string,
        userMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
        options?: { temperature?: number; max_tokens?: number; model?: string }
    ): Promise<string> {
        return this.post([{ role: 'system', content: systemPrompt }, ...userMessages], options);
    }

    /** One-shot question. */
    async ask(question: string): Promise<string> {
        return this.post([{ role: 'user', content: question }]);
    }

    /**
     * Generate a draft reply for a WhatsApp conversation.
     *
     * Returns a string[] — always an array:
     *   - length 1  → single message (maxParts === 1 or model returned plain text)
     *   - length >1 → split parts the user can send individually or merge
     */
    async generateWhatsAppDraft(
        messages: Array<{ body: string; fromMe: boolean; timestamp: number }>,
        maxParts: number = getMaxDraftParts()
    ): Promise<string[]> {
        const systemPrompt = getSystemPrompt(maxParts);

        const conversationText = messages
            .map(m => `${m.fromMe ? '[You]' : '[Customer]'} ${m.body}`)
            .join('\n');

        const raw = await this.post(
            [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: `Here is the recent conversation:\n\n${conversationText}\n\nPlease write a reply to the customer.`,
                },
            ],
            {
                max_tokens:  process.env.GROQ_MAX_TOKENS  ? parseInt(process.env.GROQ_MAX_TOKENS)    : undefined,
                temperature: process.env.GROQ_TEMPERATURE ? parseFloat(process.env.GROQ_TEMPERATURE) : undefined,
            }
        );

        return parsePartsResponse(raw, maxParts);
    }
}

// ─── Shared parser ────────────────────────────────────────────────────────────

/**
 * Attempts to parse a JSON array from the model output.
 * Falls back to a single-element array containing the raw text so callers
 * never have to handle a non-array return value.
 *
 * Handles these common model misbehaviours:
 *   1. Wrapped in ```json ... ``` fences
 *   2. Double-encoded: the model returned a JSON *string* whose value is a JSON array
 *   3. Plain text with no JSON at all → split on double newlines as a best-effort
 */
export function parsePartsResponse(raw: string, maxParts: number): string[] {
    if (maxParts <= 1) return [raw.trim()];

    // Helper: try to extract a valid string[] from an arbitrary parsed value
    const toStringArray = (val: unknown): string[] | null => {
        if (Array.isArray(val) && val.length > 0 && val.every(p => typeof p === 'string')) {
            return (val as string[]).filter(p => p.trim().length > 0).slice(0, maxParts);
        }
        return null;
    };

    // Strip markdown code fences
    const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

    // Attempt 1: direct JSON parse
    try {
        const parsed = JSON.parse(cleaned);
        const arr = toStringArray(parsed);
        if (arr) return arr;

        // Attempt 2: model returned a JSON string whose content is the array
        if (typeof parsed === 'string') {
            const inner = JSON.parse(parsed);
            const arr2 = toStringArray(inner);
            if (arr2) return arr2;
        }
    } catch { /* fall through */ }

    // Attempt 3: find the first [...] block anywhere in the output
    const bracketMatch = cleaned.match(/\[[\s\S]*\]/);
    if (bracketMatch) {
        try {
            const arr = toStringArray(JSON.parse(bracketMatch[0]));
            if (arr) return arr;
        } catch { /* fall through */ }
    }

    // Attempt 4: model returned plain prose — split on blank lines as best-effort parts
    const paragraphs = cleaned.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length > 1) {
        return paragraphs.slice(0, maxParts);
    }

    // Last resort: single part
    return [cleaned];
}

// ─── Singleton ────────────────────────────────────────────────────────────────
let _instance: GroqClient | null = null;

export function getGroqClient(): GroqClient {
    if (!_instance) {
        const key = process.env.GROQ_API_KEY;
        if (!key) throw new Error('GROQ_API_KEY is not set in your .env file.');
        _instance = new GroqClient(key, process.env.GROQ_MODEL);
    }
    return _instance;
}

export default GroqClient;