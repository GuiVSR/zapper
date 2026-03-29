import fetch from 'node-fetch';

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

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

// ─── System prompt ────────────────────────────────────────────────────────────
// TODO: Fill in your business context, tone, and instructions here.
const DEFAULT_SYSTEM_PROMPT = `You are a helpful customer support assistant.
Respond in the same language the customer wrote in.
Keep replies concise and friendly.

[ADD YOUR BUSINESS CONTEXT AND INSTRUCTIONS HERE]`;
// ─────────────────────────────────────────────────────────────────────────────

class GroqClient {
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model = 'llama-3.3-70b-versatile') {
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
            temperature: options?.temperature ?? 0.7,
            max_tokens:  options?.max_tokens  ?? 500,
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
     * Generate a draft reply for a pooled WhatsApp conversation.
     * Drop-in replacement for any other LLM client's generateWhatsAppDraft.
     */
    async generateWhatsAppDraft(
        messages: Array<{ body: string; fromMe: boolean; timestamp: number }>,
        systemPrompt = DEFAULT_SYSTEM_PROMPT
    ): Promise<string> {
        const conversationText = messages
            .map(m => `${m.fromMe ? '[You]' : '[Customer]'} ${m.body}`)
            .join('\n');

        return this.post(
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
    }
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