// ─── Shared conversation text builder and response parser ──────────────────────

import { getMaxDraftParts } from '../constants';

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
                const article = type === 'ptt' ? 'a voice message' : 'an audio message';
                if (desc) {
                    return `${speaker} [sent ${article}]\n[Transcription: ${desc}]`;
                }
                if (body) {
                    // Body may already contain the transcription from poolMessage
                    return `${speaker} ${body}`;
                }
                return `${speaker} [sent ${article} — not transcribed]`;
            }

            // Images
            if (desc) {
                return `${speaker} [sent an image${body && body !== '[image]' ? ` with caption: "${body}"` : ''}]\n[Image description: ${desc}]`;
            }

            return `${speaker} ${body}`;
        })
        .join('\n');
}

export function parsePartsResponse(raw: string, maxParts: number = getMaxDraftParts()): string[] {
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
