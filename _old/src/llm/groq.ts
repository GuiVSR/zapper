import {
    GROQ_BASE_URL,
    GROQ_DEFAULT_MODEL,
    DEFAULT_TEMPERATURE,
    DEFAULT_MAX_TOKENS,
    getSystemPrompt,
    getMaxDraftParts,
    IMAGE_ANALYSIS_PROMPT,
} from '../constants';
import { debugPrompt, debugResponse, debugImageAnalysis } from '../debug';

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
        this.model  = model;
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

    async getResponseFromHistory(
        chatHistory: GroqMessage[],
        options?: { temperature?: number; max_tokens?: number; model?: string }
    ): Promise<string> {
        return this.post(chatHistory, options);
    }

    async getResponseWithSystem(
        systemPrompt: string,
        userMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
        options?: { temperature?: number; max_tokens?: number; model?: string }
    ): Promise<string> {
        return this.post([{ role: 'system', content: systemPrompt }, ...userMessages], options);
    }

    async ask(question: string): Promise<string> {
        return this.post([{ role: 'user', content: question }]);
    }

    async analyzeImage(
        base64Data: string,
        mimeType: string,
        prompt: string = IMAGE_ANALYSIS_PROMPT,
        messageId = 'unknown'
    ): Promise<string> {
        const visionModel = 'meta-llama/llama-4-scout-17b-16e-instruct';

        const payload = {
            model: visionModel,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: `data:${mimeType};base64,${base64Data}` },
                        },
                        { type: 'text', text: prompt },
                    ],
                },
            ],
            max_tokens:  1000,
            temperature: 0.2,
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
            throw new Error(`Groq vision error: ${data.error?.message ?? response.status}`);
        }
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('Groq vision returned empty response.');

        debugImageAnalysis('Groq', visionModel, messageId, mimeType, prompt, content);

        return content;
    }

    async generateWhatsAppDraft(
        messages: Array<{ body: string; fromMe: boolean; timestamp: number; type?: string; imageDescription?: string }>,
        maxParts: number = getMaxDraftParts()
    ): Promise<string[]> {
        const systemPrompt = getSystemPrompt(maxParts);
        const activeModel  = process.env.GROQ_MODEL ?? this.model;

        const conversationText = buildConversationText(messages);

        debugPrompt('Groq', activeModel, systemPrompt, conversationText, maxParts);

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

        const parts = parsePartsResponse(raw, maxParts);
        debugResponse('Groq', raw, parts);
        return parts;
    }
}

// ─── Shared conversation text builder ─────────────────────────────────────────

export function buildConversationText(
    messages: Array<{ body: string; fromMe: boolean; timestamp: number; type?: string; imageDescription?: string }>
): string {
    return messages
        .map(m => {
            const speaker = m.fromMe ? '[You]' : '[Customer]';
            const body    = m.body?.trim() || '';
            const desc    = m.imageDescription;
            const type    = m.type ?? 'chat';

            // Audio / voice messages
            if (type === 'audio' || type === 'ptt') {
                const label = type === 'ptt' ? 'voice message' : 'audio message';
                if (desc) {
                    return `${speaker} [sent a ${label}]\n[Transcription: ${desc}]`;
                }
                if (body) {
                    // Body may already contain the transcription from poolMessage
                    return `${speaker} ${body}`;
                }
                return `${speaker} [sent a ${label} — not transcribed]`;
            }

            // Images
            if (desc) {
                return `${speaker} [sent an image${body && body !== '[image]' ? ` with caption: "${body}"` : ''}]\n[Image description: ${desc}]`;
            }

            return `${speaker} ${body}`;
        })
        .join('\n');
}

// ─── Shared parser ────────────────────────────────────────────────────────────

export function parsePartsResponse(raw: string, maxParts: number): string[] {
    const toStringArray = (val: unknown): string[] | null => {
        if (Array.isArray(val) && val.length > 0 && val.every(p => typeof p === 'string')) {
            const parts = (val as string[]).filter(p => p.trim().length > 0);
            return parts.length > 0 ? parts : null;
        }
        return null;
    };

    const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

    try {
        const parsed = JSON.parse(cleaned);
        const arr = toStringArray(parsed);
        if (arr) return arr;
        if (typeof parsed === 'string') {
            const inner = JSON.parse(parsed);
            const arr2 = toStringArray(inner);
            if (arr2) return arr2;
        }
    } catch { /* fall through */ }

    const bracketMatch = cleaned.match(/\[[\s\S]*?\]/);
    if (bracketMatch) {
        try {
            const arr = toStringArray(JSON.parse(bracketMatch[0]));
            if (arr) return arr;
        } catch { /* fall through */ }
    }

    if (maxParts > 1) {
        const paragraphs = cleaned.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
        if (paragraphs.length > 1) return paragraphs.slice(0, maxParts);
    }

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