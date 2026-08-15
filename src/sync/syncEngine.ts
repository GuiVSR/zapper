import { IWhatsAppClient, RawWhatsAppMessage, SyncResult, SyncState } from './types';
import { LocalDatabase, Message, SenderType } from '../db/localDb';
import { MessageProcessor, IncomingMessageInput } from '../messaging/messageProcessor';
// @ts-ignore
import ProgressBar = require('progress');

const WINDOW = 100;

export class SyncEngine {
    private db: LocalDatabase;
    private whatsapp: IWhatsAppClient;
    private processor: MessageProcessor;

    constructor(db: LocalDatabase, whatsapp: IWhatsAppClient, processor: MessageProcessor) {
        this.db = db;
        this.whatsapp = whatsapp;
        this.processor = processor;
    }

    async syncChat(chatId: string, maxMessages = 1000): Promise<SyncResult> {
        const stored = await this.db.getConversation(chatId);
        const storedIds = new Set(stored.messages.map(m => m.id));

        let fetchedTotal = 0;
        let processed = 0;
        let newestMessageId: string | null = null;

        const maxBatches = Math.ceil(maxMessages / WINDOW);

        for (let batchNum = 0; batchNum < maxBatches; batchNum++) {
            const currentLimit = (batchNum + 1) * WINDOW;
            const messages = await this.whatsapp.fetchMessages(chatId, currentLimit);
            fetchedTotal = messages.length;

            if (messages.length === 0) {
                break;
            }

            // Track newest message ID for cursor (first batch, first message is newest)
            if (batchNum === 0 && messages.length > 0) {
                newestMessageId = messages[0].id;
            }

            const newMessages = messages.filter(m => !storedIds.has(m.id));

            if (newMessages.length === 0) {
                break; // overlap found — we've caught up with stored data
            }

            // Process oldest-first (WhatsApp returns newest-first)
            for (let i = newMessages.length - 1; i >= 0; i--) {
                try {
                    await this.processOneMessage(newMessages[i], chatId);
                    processed++;
                } catch (err: any) {
                    console.error(`[SyncEngine] Failed to process message ${newMessages[i].id} in chat ${chatId}:`, err.message ?? err);
                }
            }

            if (messages.length < currentLimit) {
                break; // exhausted chat history
            }
        }

        if (processed > 0 && newestMessageId) {
            await this.db.setSyncCursor(chatId, {
                lastMessageId: newestMessageId,
                syncedAt: Date.now(),
            });
        }

        return {
            chatId,
            processed,
            skipped: fetchedTotal - processed,
        };
    }

    async syncAll(): Promise<SyncResult[]> {
        const chats = await this.whatsapp.getChats();
        const results: SyncResult[] = [];

        const chatIds = await this.db.listChatIds();
        const isEmpty = chatIds.length === 0;

        // Download last 100 chats first if database is empty
        const targetChats = isEmpty ? chats.slice(0, 100) : chats;

        if (isEmpty) {
            console.log('[SyncEngine] New database detected, waiting 5s for WhatsApp client stabilization...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        const bar = new ProgressBar('Syncing chats [:bar] :percent :etas', {
            total: targetChats.length,
            width: 40,
        });

        for (const chat of targetChats) {
            const chatId = chat.id?._serialized ?? chat.id ?? chat.name;
            if (!chatId) {
                bar.tick();
                continue;
            }

            const limit = isEmpty ? 100 : 1000;
            try {
                const result = await this.syncChat(chatId, limit);
                results.push(result);
            } catch (err: any) {
                console.error(`[SyncEngine] Failed to sync chat ${chatId}:`, err.message ?? err);
                results.push({
                    chatId,
                    processed: 0,
                    skipped: 0,
                });
            }
            bar.tick();
        }

        return results;
    }

    async getSyncState(chatId: string): Promise<SyncState> {
        const cursor = await this.db.getSyncCursor(chatId);
        const convo = await this.db.getConversation(chatId);

        return {
            chatId,
            cursor,
            messageCount: convo.messages.length,
        };
    }

    private async processOneMessage(raw: RawWhatsAppMessage, chatId: string): Promise<void> {
        const senderType: SenderType = raw.fromMe ? 'human' : 'customer';

        const input: IncomingMessageInput = {
            id: raw.id,
            chatId,
            timestamp: raw.timestamp,
            body: raw.body,
            type: raw.type,
            senderType,
        };

        // Download media for transcription / image analysis
        if (raw.hasMedia) {
            const media = await this.whatsapp.downloadMedia(chatId, raw.id);
            if (media) {
                input.media = {
                    data: media.data,
                    mimetype: media.mimetype,
                };
            }
        }

        await this.processor.processIncomingMessage(input);
    }
}
