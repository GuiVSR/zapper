// ─────────────────────────────────────────────────────────────────────────────
// types.ts — shared types for the message-handling layer.
// ─────────────────────────────────────────────────────────────────────────────

export interface PooledMessage {
    id: string;
    from: string;
    to: string;
    body: string;
    timestamp: number;
    type: string;
    fromMe: boolean;
    hasMedia: boolean;
    imageDescription?: string;
}

export interface AIDraft {
    chatId: string;
    parts: string[];
    basedOnMessages: PooledMessage[];
    generatedAt: number;
}

export type DraftCallback = (draft: AIDraft) => void;
export type TranscriptionCallback = (data: { messageId: string; chatId: string; transcript: string }) => void;