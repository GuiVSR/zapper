import {
    DEEPSEEK_BASE_URL,
    DEEPSEEK_DEFAULT_MODEL,
    DEFAULT_TEMPERATURE,
    DEFAULT_MAX_TOKENS,
    getSystemPrompt,
    getMaxDraftParts,
    IMAGE_ANALYSIS_PROMPT,
} from '../constants';
import { parsePartsResponse } from './groq';
import { debugPrompt, debugResponse } from '../debug';

export interface DeepSeekMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface DeepSeekRequest {
    model: string;
    messages: DeepSeekMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}

interface DeepSeekResponse {
    id: string;
    choices: Array<{
        message: DeepSeekMessage;
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    error?: { message: string; type: string; code: string };
}

class DeepSeekClient {
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model = DEEPSEEK_DEFAULT_MODEL) {
        if (!apiKey) throw new Error('DeepSeek API key is required.');
        this.apiKey = apiKey;
        this.model  = model;
    }

    private async post(
        messages: DeepSeekMessage[],
        options?: { temperature?: number; max_tokens?: number; model?: string }
    ): Promise<string> {
        const payload: DeepSeekRequest = {
            model:       options?.model       ?? this.model,
            messages,
            temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
            max_tokens:  options?.max_tokens  ?? 500,
        };

        const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json() as DeepSeekResponse;

        if (!response.ok) {
            const msg = data.error?.message ?? `HTTP ${response.status}`;
            if (response.status === 401) throw new Error(`Invalid DeepSeek API key: ${msg}`);
            if (response.status === 429) throw new Error(`DeepSeek rate limit exceeded: ${msg}`);
            throw new Error(`DeepSeek API error: ${msg}`);
        }

        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('DeepSeek returned an empty response.');
        return content;
    }

    async getResponseFromHistory(
        chatHistory: DeepSeekMessage[],
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
        _base64Data: string,
        _mimeType: string,
        _prompt: string = IMAGE_ANALYSIS_PROMPT
    ): Promise<string> {
        return '[Image received — vision analysis not supported by DeepSeek]';
    }

    async generateWhatsAppDraft(
        messages: Array<{ body: string; fromMe: boolean; timestamp: number; imageDescription?: string }>,
        maxParts: number = getMaxDraftParts()
    ): Promise<string[]> {
        const systemPrompt = getSystemPrompt(maxParts);
        const activeModel  = process.env.DEEPSEEK_MODEL ?? this.model;

        const conversationText = messages
            .map(m => {
                const speaker = m.fromMe ? '[You]' : '[Customer]';
                const body    = m.body?.trim() || '';
                const imgDesc = m.imageDescription;
                if (imgDesc) {
                    return `${speaker} [sent an image${body ? ` with caption: "${body}"` : ''}]\n[Image description: ${imgDesc}]`;
                }
                return `${speaker} ${body}`;
            })
            .join('\n');

        debugPrompt('DeepSeek', activeModel, systemPrompt, conversationText, maxParts);

        const raw = await this.post(
            [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: `Here is the recent conversation:\n\n${conversationText}\n\nPlease write a reply to the customer.`,
                },
            ],
            {
                max_tokens:  process.env.DEEPSEEK_MAX_TOKENS  ? parseInt(process.env.DEEPSEEK_MAX_TOKENS)  : undefined,
                temperature: process.env.DEEPSEEK_TEMPERATURE ? parseFloat(process.env.DEEPSEEK_TEMPERATURE) : undefined,
            }
        );

        const parts = parsePartsResponse(raw, maxParts);
        debugResponse('DeepSeek', raw, parts);
        return parts;
    }
}

let _instance: DeepSeekClient | null = null;

export function getDeepSeekClient(): DeepSeekClient {
    if (!_instance) {
        const key = process.env.DEEPSEEK_API_KEY;
        if (!key) throw new Error('DEEPSEEK_API_KEY is not set in your .env file.');
        _instance = new DeepSeekClient(key, process.env.DEEPSEEK_MODEL);
    }
    return _instance;
}

export default DeepSeekClient;