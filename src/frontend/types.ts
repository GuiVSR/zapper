export interface Message {
    id: string;
    serializedId?: string;
    from: string;
    to?: string;
    body: string;
    timestamp: number;
    type: string;
    fromMe?: boolean;
    hasMedia?: boolean;
}

export interface Chat {
    id: string;
    name: string;
    isGroup: boolean;
    unreadCount: number;
    timestamp?: number;
}

export interface AIDraft {
    chatId: string;
    /** One element per message part — length 1 when no splitting. */
    parts: string[];
    basedOnMessages: Message[];
    generatedAt: number;
}

export interface MediaItem {
    messageId: string;
    from: string;
    mimetype: string;
    data: string; // base64
    filename?: string | null;
    isSticker?: boolean;
    isAnimated?: boolean;
}
