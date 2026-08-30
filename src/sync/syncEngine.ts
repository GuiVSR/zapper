import { IWhatsAppClient, RawWhatsAppMessage, SyncResult, SyncState } from './types';
import { LocalDatabase, Message, SenderType } from '../db/localDb';
import { MessageProcessor, IncomingMessageInput } from '../messaging/messageProcessor';

const WINDOW = 100;

export class SyncEngine {
    private db: LocalDatabase;
    private whatsapp: IWhatsAppClient;
    private processor: MessageProcessor;
    private hasSynced = false;

    constructor(db: LocalDatabase, whatsapp: IWhatsAppClient, processor: MessageProcessor) {
        this.db = db;
        this.whatsapp = whatsapp;
        this.processor = processor;
    }

    private async ensureClientStable(): Promise<void> {
        // Removed 10s wait and ping logic.
        // If the store is empty, it means we have no data to sync yet.
        // SyncEngine should not artificially delay if data is not present.
        this.hasSynced = true;
    }

    private async retryWithBackoff<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (err: any) {
                if (err.message.includes('detached Frame') && i < retries - 1) {
                    console.warn(`[SyncEngine] Detached Frame error, retrying (${i + 1}/${retries})...`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Exponential backoff
                    continue;
                }
                console.error('[SyncEngine] Full error object:', err);
                throw err;
            }
        }
        return await fn();
    }

    async syncChat(chatId: string, maxMessages = 1000, startDate?: number): Promise<SyncResult> {
        // ... (rest of function unchanged, but now calls to whatsapp.fetchMessages and downloadMedia need to be wrapped)
        const stored = await this.db.getConversation(chatId);
        const storedIds = new Set(stored.messages.map(m => m.id));

        let fetchedTotal = 0;
        let processed = 0;
        let newestMessageId: string | null = null;

        const maxBatches = Math.ceil(maxMessages / WINDOW);

        for (let batchNum = 0; batchNum < maxBatches; batchNum++) {
            const currentLimit = (batchNum + 1) * WINDOW;
            const messages = await this.retryWithBackoff(() => this.whatsapp.fetchMessages(chatId, currentLimit));
            fetchedTotal = messages.length;

            if (messages.length === 0) {
                break;
            }

            // Track newest message ID for cursor (first batch, first message is newest)
            if (batchNum === 0 && messages.length > 0) {
                newestMessageId = messages[0].id;
            }

            // Filter out already stored messages
            let newMessages = messages.filter(m => !storedIds.has(m.id));

            // Apply start date filter
            if (startDate) {
                newMessages = newMessages.filter(m => m.timestamp >= startDate);
            }

            if (newMessages.length === 0) {
                // If we hit overlap or old messages, we might not want to stop immediately if we are filtering by date
                // But the current logic assumes we are fetching from newest to oldest.
                // If we hit a message older than startDate, we can stop processing this chat.
                
                // Let's check if we have any messages older than startDate
                const hasOlder = messages.some(m => m.timestamp < (startDate || 0));
                if (hasOlder) break;

                // Otherwise continue to next batch
                if (messages.length < currentLimit) break;
                continue;
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

    async syncAll(startDate?: number): Promise<SyncResult[]> {
        await this.ensureClientStable();
        console.log('[SyncEngine] Fetching chat list...');
        const chats = await this.retryWithBackoff(() => this.whatsapp.getChats());
        
        if (chats.length === 0) {
            console.warn('[SyncEngine] No chats found in store. Sync aborted.');
            return [];
        }
        
        console.log(`[SyncEngine] Retrieved ${chats.length} chats.`);
        const results: SyncResult[] = [];

        // Apply 100 chat limit only if NOT performing a targeted date sync
        const targetChats = startDate ? chats : chats.slice(0, 100);

        for (let i = 0; i < targetChats.length; i++) {
            const chat = targetChats[i];
            const chatId = chat.id?._serialized ?? chat.id ?? chat.name;
            if (!chatId) {
                continue;
            }

            // In test environment, skip excessive logging to avoid leaking handles
            if (process.env.NODE_ENV !== 'test') {
                console.log(`[SyncEngine] Downloading conversation (${i + 1}/${targetChats.length}): ${chatId}`);
            }

            try {
                const result = await this.syncChat(chatId, 1000, startDate);
                results.push(result);
            } catch (err: any) {
                console.error(`[SyncEngine] Failed to sync chat ${chatId}:`, err.message ?? err);
                results.push({
                    chatId,
                    processed: 0,
                    skipped: 0,
                });
            }
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
            const media = await this.retryWithBackoff(() => this.whatsapp.downloadMedia(chatId, raw.id));
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
