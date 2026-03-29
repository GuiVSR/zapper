import fetch from 'node-fetch';
import { GEMINI_BASE_URL, GEMINI_DEFAULT_MODEL, DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS, DEFAULT_SYSTEM_PROMPT } from '../constants';

interface GeminiPart {
    text: string;
}

interface GeminiContent {
    role: 'user' | 'model'; // Gemini uses 'model' instead of 'assistant'
    parts: GeminiPart[];
}

interface GeminiRequest {
    contents: GeminiContent[];
    systemInstruction?: {
        parts: GeminiPart[];
    };
    generationConfig?: {
        temperature?: number;
        maxOutputTokens?: number;
    };
}

interface GeminiResponse {
    candidates?: Array<{
        content: GeminiContent;
        finishReason: string;
    }>;
    error?: {
        message: string;
        code: number;
        status: string;
    };
}

class GeminiClient {
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model = GEMINI_DEFAULT_MODEL) {
        if (!apiKey) throw new Error('Gemini API key is required.');
        this.apiKey = apiKey;
        this.model = model;
    }

    private async post(
        contents: GeminiContent[],
        systemPrompt?: string,
        options?: { temperature?: number; max_tokens?: number }
    ): Promise<string> {
        const payload: GeminiRequest = {
            contents,
            generationConfig: {
                temperature:      options?.temperature,
                maxOutputTokens:  options?.max_tokens,
            },
        };

        if (systemPrompt) {
            payload.systemInstruction = { parts: [{ text: systemPrompt }] };
        }

        const url = `${GEMINI_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json() as GeminiResponse;

        if (!response.ok) {
            const msg = data.error?.message ?? `HTTP ${response.status}`;
            if (response.status === 400) throw new Error(`Gemini bad request: ${msg}`);
            if (response.status === 403) throw new Error(`Invalid Gemini API key: ${msg}`);
            if (response.status === 429) throw new Error(`Gemini rate limit exceeded: ${msg}`);
            throw new Error(`Gemini API error: ${msg}`);
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Gemini returned an empty response.');
        return text;
    }

    /** Convert a flat role/content message list into Gemini's contents format. */
    private toGeminiContents(
        messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    ): { contents: GeminiContent[]; systemPrompt: string | undefined } {
        let systemPrompt: string | undefined;
        const contents: GeminiContent[] = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                // Gemini handles system prompt separately
                systemPrompt = msg.content;
            } else {
                contents.push({
                    role:  msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }],
                });
            }
        }

        return { contents, systemPrompt };
    }

    /** Send a full message history (OpenAI-style roles) and get a reply. */
    async getResponseFromHistory(
        chatHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
        options?: { temperature?: number; max_tokens?: number }
    ): Promise<string> {
        const { contents, systemPrompt } = this.toGeminiContents(chatHistory);
        return this.post(contents, systemPrompt, options);
    }

    /** Convenience: system prompt + flat message list. */
    async getResponseWithSystem(
        systemPrompt: string,
        userMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
        options?: { temperature?: number; max_tokens?: number }
    ): Promise<string> {
        const contents: GeminiContent[] = userMessages.map(m => ({
            role:  m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));
        return this.post(contents, systemPrompt, options);
    }

    /** One-shot question. */
    async ask(question: string): Promise<string> {
        return this.post([{ role: 'user', parts: [{ text: question }] }]);
    }

    /**
     * Generate a draft reply for a pooled WhatsApp conversation.
     * Drop-in replacement for KimiClient.generateWhatsAppDraft.
     */
    async generateWhatsAppDraft(
        messages: Array<{ body: string; fromMe: boolean; timestamp: number }>,
        systemPrompt = DEFAULT_SYSTEM_PROMPT
    ): Promise<string> {
        const conversationText = messages
            .map(m => `${m.fromMe ? '[You]' : '[Customer]'} ${m.body}`)
            .join('\n');

        const contents: GeminiContent[] = [
            {
                role:  'user',
                parts: [{
                    text: `Here is the recent conversation:\n\n${conversationText}\n\nPlease write a reply to the customer.`,
                }],
            },
        ];

        return this.post(contents, systemPrompt, {
            max_tokens:  process.env.GEMINI_MAX_TOKENS  ? parseInt(process.env.GEMINI_MAX_TOKENS)    : undefined,
            temperature: process.env.GEMINI_TEMPERATURE ? parseFloat(process.env.GEMINI_TEMPERATURE) : undefined,
        });
    }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
let _instance: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
    if (!_instance) {
        const key = process.env.GEMINI_API_KEY;
        if (!key) throw new Error('GEMINI_API_KEY is not set in your .env file.');
        _instance = new GeminiClient(key, process.env.GEMINI_MODEL);
    }
    return _instance;
}

export default GeminiClient;