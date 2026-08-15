import { IWhatsAppClient, RawWhatsAppMessage } from './types';
import { Client, LocalAuth } from 'whatsapp-web.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface WhatsAppState {
    status: 'disconnected' | 'connecting' | 'qr' | 'ready';
    qr: string | null;
    updatedAt: number;
}

/**
 * WhatsApp Web.js client wrapper.
 * Implements IWhatsAppClient for testability.
 *
 * Chat ID normalization: if the chat ID doesn't already contain '@',
 * strip non-digits and append '@c.us'.
 */
export class WhatsAppClient implements IWhatsAppClient {
    private client: any = null;
    private ready: boolean = false;
    private stateFilePath: string;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private messageCache = new Map<string, any>();

    constructor(stateFilePath = path.join(process.cwd(), 'tmp', 'whatsapp_state.json')) {
        this.stateFilePath = stateFilePath;
    }

    private async saveState(status: WhatsAppState['status'], qr: string | null = null): Promise<void> {
        const state: WhatsAppState = {
            status,
            qr,
            updatedAt: Date.now(),
        };
        try {
            const dir = path.dirname(this.stateFilePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
            console.log(`[WhatsApp] State saved: ${status}${qr ? ' (QR received)' : ''}`);
        } catch (err: any) {
            console.error(`[WhatsApp] Failed to save state to ${this.stateFilePath}:`, err.message);
        }
    }

    private async cleanupLockFile(): Promise<void> {
        const lockPath = path.join(process.cwd(), 'tmp', 'wweb_auth', 'session', 'SingletonLock');
        try {
            await fs.unlink(lockPath);
            console.log('[WhatsApp] Removed stale SingletonLock');
        } catch (err) {
            // Ignore if file doesn't exist
        }
    }

    private buildClient(): void {
        this.client = new Client({
            authStrategy: new LocalAuth({ dataPath: './tmp/wweb_auth' }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
            deviceName: 'zapper',
            browserName: 'zapper',
        });

        this.client.on('ready', () => {
            this.ready = true;
            this.saveState('ready');
            console.log('[WhatsApp] Client ready');
        });

        this.client.on('disconnected', async (reason: string) => {
            this.ready = false;
            await this.saveState('disconnected');
            console.log(`[WhatsApp] Disconnected: ${reason}`);

            // If we logged out, we should NOT auto-reconnect, as the session is invalid.
            if (reason === 'LOGOUT') {
                console.log('[WhatsApp] Client logged out, stopping auto-reconnect.');
                return; 
            }

            this.scheduleReconnect();
        });

        this.client.on('auth_failure', async (msg: string) => {
            this.ready = false;
            await this.saveState('disconnected');
            console.error(`[WhatsApp] Auth failure: ${msg}`);
            this.scheduleReconnect();
        });

        this.client.on('error', (err: any) => {
            console.error('[WhatsApp] Client error:', err?.message ?? err);
        });

        this.client.on('qr', (qr: string) => {
            this.saveState('qr', qr);
            console.log('[WhatsApp] QR code received — scan with your phone');
            // QR printed via qrcode-terminal if available
            try {
                /* istanbul ignore next */
                const qrcode = require('qrcode-terminal');
                qrcode.generate(qr, { small: true });
            } catch {
                // qrcode-terminal not installed; user must use another method
                console.log('[WhatsApp] Install qrcode-terminal to display QR in terminal');
            }
        });
    }

    private scheduleReconnect(): void {
        console.log('[WhatsApp] Reconnecting in 5 seconds...');
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = setTimeout(async () => {
            try {
                if (this.client) {
                    await this.client.destroy().catch(() => {});
                }
            } catch { /* ignore */ }

            this.buildClient();

            try {
                await this.client.initialize();
            } catch (err: any) {
                console.error('[WhatsApp] Reconnection initialization failed:', err.message);
                
                // If browser lock issue, try cleanup
                if (err.message.includes('browser is already running')) {
                    await this.cleanupLockFile();
                }

                this.saveState('disconnected');
                this.scheduleReconnect();
            }
        }, 5000);
    }

    async connect(): Promise<void> {
        // Check for stale 'connecting' state from a previous, possibly crashed run
        try {
            const data = await fs.readFile(this.stateFilePath, 'utf-8');
            const state = JSON.parse(data) as WhatsAppState;
            if (state.status === 'connecting') {
                console.warn('[WhatsApp] Found stale "connecting" state, forcing reset.');
                await this.saveState('disconnected');
            }
        } catch {
            // Ignore if file doesn't exist or is unparseable
        }

        await this.saveState('connecting');

        // Proactive cleanup
        await this.cleanupLockFile();

        // Ensure no previous client instance exists
        if (this.client) {
            await this.destroy();
        }

        this.buildClient();

        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error('[WhatsApp] Connection timed out');
                this.saveState('disconnected');
                this.scheduleReconnect(); // Auto-retry
                reject(new Error('WhatsApp connection timed out (30s)'));
            }, 30000);

            this.client.once('ready', () => {
                clearTimeout(timeout);
                resolve();
            });

            // Perform initialization
            (async () => {
                try {
                    console.log('[WhatsApp] Initializing browser...');
                    await this.client.initialize();
                } catch (err: any) {
                    clearTimeout(timeout);
                    console.error('[WhatsApp] Initialization failed:', err.message);
                    
                    // If browser lock issue, try cleanup
                    if (err.message.includes('browser is already running')) {
                        console.log('[WhatsApp] Browser lock detected, cleaning and retrying...');
                        await this.cleanupLockFile();
                        
                        // Try one final restart
                        this.buildClient();
                        try {
                            await this.client.initialize();
                            return; // Success
                        } catch (retryErr: any) {
                            console.error('[WhatsApp] Initialization failed after retry:', retryErr.message);
                        }
                    }

                    this.saveState('disconnected');
                    this.scheduleReconnect(); // Auto-retry
                    reject(err);
                }
            })();
        });
    }

    async destroy(): Promise<void> {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.client) {
            try {
                await this.client.destroy();
            } catch (err) {
                console.error('[WhatsApp] Error during destroy:', err);
            }
            this.client = null;
            this.ready = false;
        }
    }

    isReady(): boolean {
        return this.ready;
    }

    async getChats(): Promise<any[]> {
        if (!this.client) {
            throw new Error('WhatsApp client not initialized');
        }
        return this.retryWithBackoff(() => this.client.getChats());
    }

    private async retryWithBackoff<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (err: any) {
                if (err.message.includes('detached Frame') && i < retries - 1) {
                    console.warn(`[WhatsApp] Detached Frame error, retrying (${i + 1}/${retries})...`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Exponential backoff
                    continue;
                }
                throw err;
            }
        }
        return await fn();
    }

    async fetchMessages(chatId: string, limit: number): Promise<RawWhatsAppMessage[]> {
        if (!this.client) {
            throw new Error('WhatsApp client not initialized');
        }

        const normalizedId = this.normalizeChatId(chatId);
        const chat = await this.client.getChatById(normalizedId);
        const messages = await chat.fetchMessages({ limit });

        for (const msg of messages) {
            this.messageCache.set(msg.id._serialized, msg);
        }
        if (this.messageCache.size > 1000) {
            const keysToEvict = Array.from(this.messageCache.keys()).slice(0, this.messageCache.size - 1000);
            for (const key of keysToEvict) {
                this.messageCache.delete(key);
            }
        }

        return messages.map((msg: any): RawWhatsAppMessage => ({
            id: msg.id._serialized,
            timestamp: msg.timestamp * 1000, // WhatsApp uses seconds, we use ms
            body: msg.body ?? '',
            type: msg.type ?? 'chat',
            fromMe: msg.fromMe ?? false,
            hasMedia: msg.hasMedia ?? false,
            from: msg.from ?? '',
            to: msg.to ?? '',
            author: msg.author ?? undefined,
        }));
    }

    async downloadMedia(
        chatId: string,
        messageId: string
    ): Promise<{ mimetype: string; data: string } | null> {
        if (!this.client) {
            throw new Error('WhatsApp client not initialized');
        }

        try {
            // Check cache first
            const cachedMsg = this.messageCache.get(messageId);
            if (cachedMsg && cachedMsg.hasMedia) {
                try {
                    const media = await cachedMsg.downloadMedia();
                    if (media) {
                        return {
                            mimetype: media.mimetype,
                            data: media.data, // base64-encoded
                        };
                    }
                } catch (mediaErr: any) {
                    console.error(`[WhatsApp] Failed to download media for cached message ${messageId}:`, mediaErr.message ?? mediaErr);
                    return null;
                }
            }

            // Fallback to searching chat history
            const normalizedId = this.normalizeChatId(chatId);
            for (const limit of [50, 200, 500]) {
                const chat = await this.client.getChatById(normalizedId);
                const messages = await chat.fetchMessages({ limit });
                const msg = messages.find((m: any) => m.id._serialized === messageId);

                if (msg) {
                    this.messageCache.set(msg.id._serialized, msg);
                    if (msg.hasMedia) {
                        try {
                            const media = await msg.downloadMedia();
                            if (media) {
                                return {
                                    mimetype: media.mimetype,
                                    data: media.data, // base64-encoded
                                };
                            }
                        } catch (mediaErr: any) {
                            console.error(`[WhatsApp] Failed to download media for fetched message ${messageId}:`, mediaErr.message ?? mediaErr);
                            return null;
                        }
                    }
                }

                if (messages.length < limit) {
                    break; // exhausted chat, message not found
                }
            }
        } catch (err: any) {
            console.error(`[WhatsApp] Error in downloadMedia for ${chatId}/${messageId}:`, err.message ?? err);
        }

        return null;
    }

    private normalizeChatId(chatId: string): string {
        if (chatId.includes('@')) {
            return chatId; // already in full format (e.g. 5511999999999@c.us)
        }
        const digits = chatId.replace(/\D/g, '');
        return `${digits}@c.us`;
    }
}
