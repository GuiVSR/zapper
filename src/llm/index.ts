import { LLMProvider } from '../constants';
import { getGroqClient }     from './groq';
import { getGeminiClient }   from './gemini';
import { getDeepSeekClient } from './deepseek';

export type LLMClient = {
    generateWhatsAppDraft: (messages: any[], maxParts: number) => Promise<string[]>;
    analyzeImage: (base64Data: string, mimeType: string, prompt?: string) => Promise<string>;
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