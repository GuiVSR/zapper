/* istanbul ignore file */

export interface RawWhatsAppMessage {
    id: string;          // _serialized ID from whatsapp-web.js
    timestamp: number;
    body: string;
    type: string;        // chat, image, audio, ptt, video, sticker, etc.
    fromMe: boolean;
    hasMedia: boolean;
    from: string;
    to: string;
    author?: string;
}

export interface SyncCursor {
    lastMessageId: string;
    syncedAt: number;    // Date.now()
}

export interface SyncState {
    chatId: string;
    cursor: SyncCursor | null;
    messageCount: number;
}

export interface SyncResult {
    chatId: string;
    processed: number;
    skipped: number;
}

export interface IWhatsAppClient {
    connect(): Promise<void>;
    destroy(): Promise<void>;
    isReady(): boolean;
    getChats(): Promise<any[]>;
    fetchMessages(chatId: string, limit: number): Promise<RawWhatsAppMessage[]>;
    downloadMedia(chatId: string, messageId: string): Promise<{ mimetype: string; data: string } | null>;
}
