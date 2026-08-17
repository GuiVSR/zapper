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
    loadMessages: (chatId: string, limit: number) => {
        const msgs = store.messages.get(chatId) || [];
        console.log(`[WhatsApp] Store: Loading messages for ${chatId}. Total in store: ${msgs.length}`);
        return msgs.slice(-limit);
    },
    bind: (ev: any) => {
        ev.on('history-sync', (data: any) => {
            console.log(`[WhatsApp] Store: history-sync received. Type: ${data.syncType}, Chunk: ${data.chunkOrder || 'N/A'}, Progress: ${data.progress || 'N/A'}%`);
            
            // Handle conversation history
            if (data.conversations) {
                for (const convo of data.conversations) {
                    // Add chat metadata to store
                    store.chats.set(convo.id, {
                        id: convo.id,
                        name: convo.name || convo.id,
                        unreadCount: convo.unreadCount || 0
                    });

                    if (convo.messages) {
                        const chatId = convo.id;
                        const msgs = store.messages.get(chatId) || [];
                        for (const m of convo.messages) {
                            const msg = m.message ? m.message : m;
                            msgs.push(msg);
                        }
                        store.messages.set(chatId, msgs);
                        console.log(`[WhatsApp] Store: Added ${convo.messages.length} messages to ${chatId}. Total: ${msgs.length}`);
                    }
                }
            }
            
            // Handle raw messages
            if (data.messages) {
                for (const msg of data.messages) {
                    const chatId = msg.key.remoteJid!;
                    const msgs = store.messages.get(chatId) || [];
                    msgs.push(msg);
                    store.messages.set(chatId, msgs);
                }
                console.log(`[WhatsApp] Store: Added ${data.messages.length} raw messages`);
            }
            
            // Handle cursor
            if (data.cursor) {
                console.log(`[WhatsApp] Store: History sync cursor received:`, JSON.stringify(data.cursor));
            }
        });
        ev.on('messages.upsert', (m: any) => {
            console.log(`[WhatsApp] Store: messages.upsert received, ${m.messages.length} messages. Type: ${m.type}`);
            for (const msg of m.messages) {
                // If it's a history sync notification, we don't store it as a regular message
                if (msg.message?.protocolMessage?.type === 'HISTORY_SYNC_NOTIFICATION') {
                    console.log(`[WhatsApp] Store: Ignoring HISTORY_SYNC_NOTIFICATION message ${msg.key.id}`);
                    continue;
                }
                
                console.log(`[WhatsApp] DEBUG: Message structure: ${JSON.stringify(msg, null, 2)}`);
                const chatId = msg.key.remoteJid!;
                const msgs = store.messages.get(chatId) || [];
                msgs.push(msg);
                store.messages.set(chatId, msgs);
            }
        });
        ev.on('chats.set', (data: any) => {
            console.log(`[WhatsApp] DEBUG: chats.set data type: ${typeof data}, keys: ${Array.isArray(data) ? 'array' : Object.keys(data)}`);
            const chats = Array.isArray(data) ? data : (data.chats || []);
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
        ev.on('chats.update', (chats: any[]) => {
            console.log(`[WhatsApp] Store: chats.update received, ${chats.length} chats`);
            for (const chat of chats) {
                const existing = store.chats.get(chat.id) || {};
                store.chats.set(chat.id, { ...existing, ...chat });
            }
        });
        ev.on('contacts.upsert', (contacts: any[]) => {
            console.log(`[WhatsApp] Store: contacts.upsert received, ${contacts.length} contacts`);
            // Baileys often puts chat info in contacts
            for (const contact of contacts) {
                if (contact.id.endsWith('@s.whatsapp.net')) {
                   store.chats.set(contact.id, { id: contact.id, name: contact.notify || contact.name || contact.id });
                }
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
            browser: ["Chrome", "Ubuntu", "1.0.0"],
            syncFullHistory: true
        });

        store.bind(this.socket.ev);
        this.socket.ev.on('creds.update', saveCreds);

        this.socket.ev.on('connection.update', (update: Partial<baileys.ConnectionState>) => {
            // Log the update but specifically try to catch the error detail
            console.log('[WhatsApp] Connection update:', JSON.stringify(update, (key, value) => 
                key === 'lastDisconnect' ? value : value, 2));
            
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                console.log('[WhatsApp] QR code received — scan with your phone');
                qrcode.generate(qr, { small: true });
            }
            if (connection === 'close') {
                // Log the full error object for better debugging
                const error = (lastDisconnect?.error as any);
                console.error('[WhatsApp] Connection closed details:', JSON.stringify(error, null, 2));
                
                const shouldReconnect = error?.output?.statusCode !== baileys.DisconnectReason.loggedOut;
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
        
        // Wait for store to be populated if it's empty
        let attempts = 0;
        while (store.chats.size === 0 && attempts < 10) {
            console.log(`[WhatsApp] Store is empty, waiting 1s for chats to populate (attempt ${attempts + 1}/10)...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        const chats = store.allChats();
        console.log(`[WhatsApp] getChats returning ${chats.length} chats`);
        return chats;
    }

    async fetchMessages(chatId: string, limit: number): Promise<RawWhatsAppMessage[]> {
        if (!this.socket) throw new Error('WhatsApp client not initialized');
        
        const allMessages = store.messages.get(chatId) || [];
        console.log(`[WhatsApp] fetchMessages for ${chatId} (limit: ${limit}) - Total in store: ${allMessages.length}`);
        
        const messages = allMessages.slice(-limit);
        
        return messages.map((msg: any): RawWhatsAppMessage => {
            // Use Baileys helper to extract content
            const content = baileys.extractMessageContent(msg.message);
            
            return {
                id: msg.key.id!,
                timestamp: Number(msg.messageTimestamp) * 1000,
                body: content?.conversation || content?.extendedTextMessage?.text || content?.imageMessage?.caption || '',
                type: content?.conversation ? 'chat' : 'media', // Simplified
                fromMe: msg.key.fromMe ?? false,
                hasMedia: !!(content?.imageMessage || content?.audioMessage || content?.videoMessage),
                from: msg.key.remoteJid ?? '',
                to: msg.key.remoteJid ?? '',
            };
        });
    }

    async downloadMedia(chatId: string, messageId: string): Promise<{ mimetype: string; data: string } | null> {
        if (!this.socket) throw new Error('WhatsApp client not initialized');
        // Placeholder for media download implementation with Baileys
        return null;
    }
}
