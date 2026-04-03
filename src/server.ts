import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

export interface MessageHandler {
    (message: Message): void;
}

export interface StickerHandler {
    (sticker: StickerInfo): void;
}

export interface StickerInfo {
    message: Message;
    data: Buffer;
    mimeType: string;
    isAnimated: boolean;
    fileSize: number;
    dimensions?: { width: number; height: number };
    savedPath?: string;
}

export interface WhatsAppClientConfig {
    headless?: boolean;
    onQR?: (qr: string) => void;
    onReady?: () => void;
    onMessage?: MessageHandler;
    onSticker?: StickerHandler;
    onAuthFailure?: (msg: string) => void;
    onDisconnected?: (reason: string) => void;
    onError?: (error: Error) => void;
    stickersDir?: string;
}

export interface MessageHistory {
    id: string;
    serializedId: string;
    from: string;
    to: string;
    body: string;
    timestamp: number;
    type: string;
    fromMe: boolean;
    hasMedia: boolean;
    author?: string;
    isForwarded: boolean;
}

const AUTH_DIR      = '.wwebjs_auth';
const TMP_DIR       = path.resolve('tmp');
const STICKERS_DIR  = path.join(TMP_DIR, 'stickers');
const REINIT_DELAY  = 3_000;
const MAX_REINIT    = 5;

/** Allowed MIME types for document uploads. */
export const ALLOWED_MEDIA_TYPES = new Set([
    // PDF
    'application/pdf',
    // Office
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         // .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/msword',                                                        // .doc
    'application/vnd.ms-excel',                                                  // .xls
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);

export class WhatsAppClient {
    private client!: Client;
    private config: WhatsAppClientConfig;
    private isInitialized: boolean = false;
    private stickersDir: string;
    private reinitAttempts: number = 0;

    constructor(config: WhatsAppClientConfig = {}) {
        this.config = { headless: true, stickersDir: STICKERS_DIR, ...config };
        this.stickersDir = this.config.stickersDir!;

        // Ensure tmp/ and tmp/stickers/ exist
        if (!fs.existsSync(TMP_DIR)) {
            fs.mkdirSync(TMP_DIR, { recursive: true });
        }
        if (!fs.existsSync(this.stickersDir)) {
            fs.mkdirSync(this.stickersDir, { recursive: true });
        }

        this.buildClient();
    }

    // ── Client construction & event wiring ────────────────────────────────────

    private buildClient(): void {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: this.config.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
        });

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.client.on('qr', (qr: string) => {
            if (this.config.onQR) {
                this.config.onQR(qr);
            } else {
                console.log('📱 Scan this QR code with WhatsApp:');
                qrcode.generate(qr, { small: true });
            }
        });

        this.client.on('ready', () => {
            this.isInitialized = true;
            this.reinitAttempts = 0;
            if (this.config.onReady) {
                this.config.onReady();
            } else {
                console.log('✅ WhatsApp client is ready!');
            }
        });

        this.client.on('message', async (message: Message) => {
            if (message.type === 'sticker') {
                await this.handleSticker(message);
            }
            if (this.config.onMessage) {
                this.config.onMessage(message);
            }
        });

        this.client.on('auth_failure', (msg: string) => {
            console.error('❌ Auth failure:', msg);
            this.isInitialized = false;
            if (this.config.onAuthFailure) {
                this.config.onAuthFailure(msg);
            }
            this.clearAuthSession();
            this.scheduleReinit();
        });

        this.client.on('disconnected', (reason: string) => {
            console.log('❌ Disconnected:', reason);
            this.isInitialized = false;
            if (this.config.onDisconnected) {
                this.config.onDisconnected(reason);
            }
            if (reason === 'LOGOUT') {
                this.clearAuthSession();
            }
            this.scheduleReinit();
        });

        this.client.on('error', (error: Error) => {
            if (this.config.onError) {
                this.config.onError(error);
            } else {
                console.error('❌ Error:', error);
            }
        });
    }

    // ── Session management ────────────────────────────────────────────────────

    private clearAuthSession(): void {
        try {
            if (fs.existsSync(AUTH_DIR)) {
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                console.log('🗑  Cleared auth session — a new QR code will be shown on reconnect.');
            }
        } catch (err) {
            console.error('Failed to clear auth session:', err);
        }
    }

    private scheduleReinit(): void {
        if (this.reinitAttempts >= MAX_REINIT) {
            console.error(`❌ Gave up reinitialising after ${MAX_REINIT} attempts.`);
            return;
        }

        this.reinitAttempts++;
        console.log(`🔄 Reinitialising in ${REINIT_DELAY / 1000}s (attempt ${this.reinitAttempts}/${MAX_REINIT})…`);

        setTimeout(async () => {
            try {
                await this.client.destroy().catch(() => {});
            } catch { /* ignore */ }

            this.buildClient();

            try {
                await this.client.initialize();
            } catch (err) {
                console.error('❌ Reinit failed:', err);
                this.clearAuthSession();
                this.scheduleReinit();
            }
        }, REINIT_DELAY);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn('Client is already initialized');
            return;
        }

        console.log('🚀 Initializing WhatsApp client...');

        try {
            await this.client.initialize();
        } catch (err: any) {
            console.error('❌ Initialize error:', err?.message ?? err);
            this.clearAuthSession();
            this.scheduleReinit();
        }
    }

    public async getChatHistory(chatId: string, limit: number = 50): Promise<MessageHistory[]> {
        if (!this.isInitialized) throw new Error('Client not initialized.');

        let formattedId = chatId;
        if (!formattedId.includes('@') && !formattedId.includes('-')) {
            formattedId = `${formattedId.replace(/[^0-9+]/g, '')}@c.us`;
        }

        const chat = await this.client.getChatById(formattedId);
        const messages = await chat.fetchMessages({ limit });

        return messages.map(msg => ({
            id:           msg.id.id,
            serializedId: msg.id._serialized,
            from:         msg.from,
            to:           msg.to,
            body:         msg.body || '',
            timestamp:    msg.timestamp,
            type:         msg.type,
            fromMe:       msg.fromMe,
            hasMedia:     msg.hasMedia,
            author:       msg.author,
            isForwarded:  msg.isForwarded || false,
        }));
    }

    public async getAllChatsWithMessages(limit: number = 10): Promise<Map<string, MessageHistory[]>> {
        if (!this.isInitialized) throw new Error('Client not initialized.');

        const chats = await this.client.getChats();
        const chatHistory = new Map<string, MessageHistory[]>();

        for (const chat of chats.slice(0, limit)) {
            const messages = await chat.fetchMessages({ limit: 20 });
            chatHistory.set(chat.id._serialized, messages.map(msg => ({
                id:           msg.id.id,
                serializedId: msg.id._serialized,
                from:         msg.from,
                to:           msg.to,
                body:         msg.body || '',
                timestamp:    msg.timestamp,
                type:         msg.type,
                fromMe:       msg.fromMe,
                hasMedia:     msg.hasMedia,
                author:       msg.author,
                isForwarded:  msg.isForwarded || false,
            })));
        }

        return chatHistory;
    }

    public async searchMessages(query: string, limit: number = 50): Promise<MessageHistory[]> {
        if (!this.isInitialized) throw new Error('Client not initialized.');

        const chats = await this.client.getChats();
        const results: MessageHistory[] = [];

        for (const chat of chats) {
            const messages = await chat.fetchMessages({ limit: 100 });
            const matches = messages
                .filter(msg => msg.body?.toLowerCase().includes(query.toLowerCase()))
                .map(msg => ({
                    id:           msg.id.id,
                    serializedId: msg.id._serialized,
                    from:         msg.from,
                    to:           msg.to,
                    body:         msg.body || '',
                    timestamp:    msg.timestamp,
                    type:         msg.type,
                    fromMe:       msg.fromMe,
                    hasMedia:     msg.hasMedia,
                    author:       msg.author,
                    isForwarded:  msg.isForwarded || false,
                }));
            results.push(...matches);
            if (results.length >= limit) break;
        }

        results.sort((a, b) => b.timestamp - a.timestamp);
        return results.slice(0, limit);
    }

    public async sendMessage(to: string, message: string): Promise<any> {
        if (!this.isInitialized) throw new Error('Client not initialized.');

        let chatId = to;
        if (!chatId.includes('@') && !chatId.includes('-')) {
            chatId = `${chatId.replace(/[^0-9+]/g, '')}@c.us`;
        }

        const chat = await this.client.getChatById(chatId);
        return chat.sendMessage(message);
    }

    /**
     * Send a file (document, image, etc.) to a chat.
     * @param to      Chat ID or phone number
     * @param base64  Base64-encoded file data
     * @param mimetype MIME type of the file
     * @param filename Original filename (shown to recipient)
     * @param caption  Optional caption text
     */
    public async sendMedia(
        to: string,
        base64: string,
        mimetype: string,
        filename: string,
        caption?: string,
    ): Promise<any> {
        if (!this.isInitialized) throw new Error('Client not initialized.');

        let chatId = to;
        if (!chatId.includes('@') && !chatId.includes('-')) {
            chatId = `${chatId.replace(/[^0-9+]/g, '')}@c.us`;
        }

        const media = new MessageMedia(mimetype, base64, filename);
        const chat  = await this.client.getChatById(chatId);

        return chat.sendMessage(media, {
            caption: caption || undefined,
            sendMediaAsDocument: true,
        });
    }

    public async markChatAsRead(chatId: string): Promise<void> {
        if (!this.isInitialized) return;

        let formattedId = chatId;
        if (!formattedId.includes('@') && !formattedId.includes('-')) {
            formattedId = `${formattedId.replace(/[^0-9+]/g, '')}@c.us`;
        }

        const chat = await this.client.getChatById(formattedId);
        await chat.sendSeen();
    }

    public async sendSticker(to: string, stickerPath: string): Promise<void> {
        if (!this.isInitialized) throw new Error('Client not initialized.');

        let chatId = to;
        if (!chatId.includes('@') && !chatId.includes('-')) {
            chatId = `${chatId.replace(/[^0-9+]/g, '')}@c.us`;
        }

        const media = MessageMedia.fromFilePath(stickerPath);
        const chat  = await this.client.getChatById(chatId);
        await chat.sendMessage(media, { sendMediaAsSticker: true });
    }

    public async getContactInfo(contactId: string) {
        if (!this.isInitialized) throw new Error('Client not initialized.');

        try {
            const contact = await this.client.getContactById(contactId);
            return {
                number:   contact.number,
                name:     contact.name,
                pushname: contact.pushname,
                isMe:     contact.isMe,
                isUser:   contact.isUser,
            };
        } catch {
            return null;
        }
    }

    public async getMessageMedia(serializedId: string): Promise<{ mimetype: string; data: string } | null> {
        if (!this.isInitialized) throw new Error('Client not initialized.');

        try {
            const parts = serializedId.split('_');
            if (parts.length < 3) throw new Error(`Cannot parse serializedId: ${serializedId}`);
            const chatId = parts[1];
            const shortId = parts.slice(2).join('_');

            const chat = await this.client.getChatById(chatId);

            for (const limit of [50, 200, 500]) {
                const messages = await chat.fetchMessages({ limit });
                const msg = messages.find(m => m.id._serialized === serializedId || m.id.id === shortId);
                if (msg) {
                    if (!msg.hasMedia) return null;
                    const media = await msg.downloadMedia();
                    if (!media) return null;
                    return { mimetype: media.mimetype, data: media.data };
                }
            }

            console.warn(`[getMessageMedia] Message not found: ${serializedId}`);
            return null;
        } catch (err) {
            console.error(`[getMessageMedia] Failed for ${serializedId}:`, err);
            return null;
        }
    }

    public async getChats() {
        if (!this.isInitialized) throw new Error('Client not initialized.');
        return this.client.getChats();
    }

    public async logout(): Promise<void> {
        if (!this.isInitialized) return;
        await this.client.logout();
        this.isInitialized = false;
    }

    public async destroy(): Promise<void> {
        if (this.client) {
            await this.client.destroy();
            this.isInitialized = false;
        }
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public getRawClient(): Client {
        return this.client;
    }

    // ── Sticker handling ──────────────────────────────────────────────────────

    private async handleSticker(message: Message): Promise<void> {
        try {
            const media = await message.downloadMedia();
            if (!media) return;

            const buffer     = Buffer.from(media.data, 'base64');
            const isAnimated = media.mimetype === 'image/webp' && this.isAnimatedWebp(buffer);

            const stickerInfo: StickerInfo = {
                message,
                data:     buffer,
                mimeType: media.mimetype,
                isAnimated,
                fileSize: buffer.length,
            };

            try {
                const metadata = await sharp(buffer).metadata();
                stickerInfo.dimensions = { width: metadata.width || 0, height: metadata.height || 0 };
            } catch { /* dimensions not available */ }

            const filename  = `sticker_${Date.now()}_${message.id.id}.webp`;
            const filepath  = path.join(this.stickersDir, filename);
            fs.writeFileSync(filepath, buffer);
            stickerInfo.savedPath = filepath;

            if (this.config.onSticker) {
                this.config.onSticker(stickerInfo);
            } else {
                this.displaySticker(stickerInfo);
            }
        } catch (err) {
            console.error('Error handling sticker:', err);
        }
    }

    private isAnimatedWebp(buffer: Buffer): boolean {
        try {
            return buffer.toString('ascii', 0, 12).includes('ANIM');
        } catch {
            return false;
        }
    }

    private displaySticker(stickerInfo: StickerInfo): void {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🎨 Sticker received from: ${stickerInfo.message.from}`);
        console.log(`Type: ${stickerInfo.isAnimated ? 'Animated' : 'Static'}`);
        console.log(`Size: ${(stickerInfo.fileSize / 1024).toFixed(2)} KB`);
        if (stickerInfo.dimensions) console.log(`Dimensions: ${stickerInfo.dimensions.width}x${stickerInfo.dimensions.height}`);
        if (stickerInfo.savedPath)  console.log(`Saved to: ${stickerInfo.savedPath}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
}

export function createWhatsAppClient(config?: WhatsAppClientConfig): WhatsAppClient {
    return new WhatsAppClient(config);
}