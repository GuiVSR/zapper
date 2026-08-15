import { IWhatsAppClient, RawWhatsAppMessage } from './types';
import * as baileys from '@whiskeysockets/baileys';
import * as path from 'path';
import * as fs from 'fs/promises';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

// Simple in-memory store
const store = {
    chats: new Map<string, any>(),
    messages: new Map<string, any[]>(),
    allChats: () => Array.from(store.chats.values()),
    loadMessages: (chatId: string, limit: number) => store.messages.get(chatId)?.slice(-limit) || [],
    bind: (ev: any) => {
        ev.on('messages.upsert', (m: any) => {
            console.log(`[WhatsApp] Store: messages.upsert received, ${m.messages.length} messages`);
            for (const msg of m.messages) {
                const chatId = msg.key.remoteJid!;
                const msgs = store.messages.get(chatId) || [];
                msgs.push(msg);
                store.messages.set(chatId, msgs);
            }
        });
        ev.on('chats.set', (chats: any[]) => {
            console.log(`[WhatsApp] Store: chats.set received, ${chats.length} chats`);
            for (const chat of chats) {
                store.chats.set(chat.id, chat);
            }
        });
        ev.on('chats.upsert', (chats: any[]) => {
            console.log(`[WhatsApp] Store: chats.upsert received, ${chats.length} chats`);
            for (const chat of chats) {
                store.chats.set(chat.id, chat);
            }
        });
    }
};

export class WhatsAppClient implements IWhatsAppClient {
    private socket: baileys.WASocket | null = null;
    private ready: boolean = false;
    private authDir: string;
    private logger: any;

    constructor(authDir = path.join(process.cwd(), 'tmp', 'baileys_auth')) {
        this.authDir = authDir;
        this.logger = pino({ level: 'silent' });
    }


    async connect(): Promise<void> {
        const { state, saveCreds } = await baileys.useMultiFileAuthState(this.authDir);

        this.socket = baileys.makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: this.logger,
            browser: ['zapper', 'Chrome', '126.0.0.0']
        });

        store.bind(this.socket.ev);
        this.socket.ev.on('creds.update', saveCreds);

        // Debug all events
        this.socket.ev.process((events) => {
             // Optional: log specific events for debugging if needed
        });
        
        this.socket.ev.on('connection.update', (update: Partial<baileys.ConnectionState>) => {
            console.log('[WhatsApp] Full update object:', JSON.stringify(update, (key, value) => 
                key === 'lastDisconnect' ? undefined : value, 2));
            
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                console.log('[WhatsApp] QR code received — scan with your phone');
                qrcode.generate(qr, { small: true });
            }
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== baileys.DisconnectReason.loggedOut;
                console.log(`[WhatsApp] Connection closed, shouldReconnect: ${shouldReconnect}`);
                this.ready = false;
                if (shouldReconnect) this.connect();
            } else if (connection === 'open') {
                this.ready = true;
                console.log('[WhatsApp] Client ready');
            }
        });
    }

    async destroy(): Promise<void> {
        if (this.socket) {
            await this.socket.logout();
            this.socket = null;
            this.ready = false;
        }
    }

    isReady(): boolean {
        return this.ready;
    }

    async getChats(): Promise<any[]> {
        if (!this.socket) throw new Error('WhatsApp client not initialized');
        
        // If store is empty, wait briefly as chats might still be loading
        if (store.chats.size === 0) {
            console.log('[WhatsApp] Store is empty, waiting 5s for chats to populate...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        const chats = store.allChats();
        console.log(`[WhatsApp] getChats returning ${chats.length} chats`);
        return chats;
    }

    async fetchMessages(chatId: string, limit: number): Promise<RawWhatsAppMessage[]> {
        if (!this.socket) throw new Error('WhatsApp client not initialized');
        const messages = store.loadMessages(chatId);
        
        return messages.map((msg: any): RawWhatsAppMessage => ({
            id: msg.key.id!,
            timestamp: Number(msg.messageTimestamp) * 1000,
            body: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
            type: msg.message?.conversation ? 'chat' : 'media', // Simplified
            fromMe: msg.key.fromMe ?? false,
            hasMedia: !!(msg.message?.imageMessage || msg.message?.audioMessage || msg.message?.videoMessage),
            from: msg.key.remoteJid ?? '',
            to: msg.key.remoteJid ?? '',
        }));
    }

    async downloadMedia(chatId: string, messageId: string): Promise<{ mimetype: string; data: string } | null> {
        if (!this.socket) throw new Error('WhatsApp client not initialized');
        // Placeholder for media download implementation with Baileys
        return null;
    }
}
