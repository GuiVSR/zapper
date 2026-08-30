import { SyncEngine } from './syncEngine';
import { IWhatsAppClient, RawWhatsAppMessage, SyncCursor } from './types';
import { LocalDatabase, Message } from '../db/localDb';
import { MessageProcessor } from '../messaging/messageProcessor';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock MessageProcessor — we only care that it's called, not how
jest.mock('../messaging/messageProcessor', () => ({
    MessageProcessor: jest.fn().mockImplementation(() => ({
        processIncomingMessage: jest.fn().mockResolvedValue({}),
    })),
}));

function makeRawMsg(overrides: Partial<RawWhatsAppMessage> = {}): RawWhatsAppMessage {
    const { id: rawId, ...rest } = overrides;
    return {
        id: `false_${rawId ?? '_' + Math.random().toString(36).slice(2)}@c.us`,
        timestamp: Date.now(),
        body: 'test message',
        type: 'chat',
        fromMe: false,
        hasMedia: false,
        from: '5511999999999@c.us',
        to: '5511888888888@c.us',
        ...rest,
    };
}

function createMockClient(messages: RawWhatsAppMessage[] = []): jest.Mocked<IWhatsAppClient> {
    return {
        connect: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
        isReady: jest.fn().mockReturnValue(true),
        getChats: jest.fn().mockResolvedValue([]),
        fetchMessages: jest.fn().mockResolvedValue(messages),
        downloadMedia: jest.fn().mockResolvedValue(null),
    };
}

describe('SyncEngine', () => {
    const testDbDir = path.join(process.cwd(), 'tmp', 'test_sync_db');
    let db: LocalDatabase;
    let client: jest.Mocked<IWhatsAppClient>;
    let processor: MessageProcessor;
    let engine: SyncEngine;

    beforeEach(async () => {
        await fs.rm(testDbDir, { recursive: true, force: true });
        db = new LocalDatabase(testDbDir);
        client = createMockClient();
        processor = new (MessageProcessor as any)();
        engine = new SyncEngine(db, client, processor);
    });

    afterAll(async () => {
        await fs.rm(testDbDir, { recursive: true, force: true });
    });

    // ── syncChat ───────────────────────────────────────────────────────

    it('processes all messages on initial sync (empty DB)', async () => {
        const msgs = [
            makeRawMsg({ id: '1', timestamp: 1000 }),
            makeRawMsg({ id: '2', timestamp: 2000 }),
            makeRawMsg({ id: '3', timestamp: 3000 }),
        ];
        client.fetchMessages.mockResolvedValue(msgs);

        const result = await engine.syncChat('5511999999999');

        expect(result.processed).toBe(3);
        expect(result.skipped).toBe(0);
        expect(processor.processIncomingMessage).toHaveBeenCalledTimes(3);
    });

    it('skips already-stored messages (incremental sync)', async () => {
        // Pre-seed DB with one message
        await db.addMessage('5511999999999', {
            id: 'false_2@c.us',
            timestamp: 2000,
            body: 'existing',
            message: 'existing',
            type: 'chat',
            senderType: 'customer',
        });

        const msgs = [
            makeRawMsg({ id: '3', timestamp: 3000 }),
            makeRawMsg({ id: '2', timestamp: 2000 }),
            makeRawMsg({ id: '1', timestamp: 1000 }),
        ];
        client.fetchMessages.mockResolvedValue(msgs);

        const result = await engine.syncChat('5511999999999');

        expect(result.processed).toBe(2); // msg 1 and 3 only
        expect(result.skipped).toBe(1);   // msg 2 skipped
    });

    it('returns zero processed when all messages already stored', async () => {
        await db.addMessage('5511999999999', {
            id: 'false_1@c.us',
            timestamp: 1000,
            body: 'hello',
            message: 'hello',
            type: 'chat',
            senderType: 'customer',
        });

        client.fetchMessages.mockResolvedValue([makeRawMsg({ id: '1' })]);

        const result = await engine.syncChat('5511999999999');

        expect(result.processed).toBe(0);
        expect(result.skipped).toBe(1);
    });

    it('stops when fetch returns empty array', async () => {
        client.fetchMessages.mockResolvedValue([]);

        const result = await engine.syncChat('5511999999999');

        expect(result.processed).toBe(0);
        expect(client.fetchMessages).toHaveBeenCalledTimes(1);
    });

    it('stops when fetch returns fewer messages than batch size (exhausted chat)', async () => {
        const msgs = [makeRawMsg({ id: '1' }), makeRawMsg({ id: '2' })];
        // batchSize starts at 50, returns only 2 → exhausted
        client.fetchMessages.mockResolvedValue(msgs);

        const result = await engine.syncChat('5511999999999');

        expect(result.processed).toBe(2);
        expect(client.fetchMessages).toHaveBeenCalledTimes(1); // no second batch
    });

    it('grows window when batch is full and no overlap found', async () => {
        // First call: return 100 messages (full batch, no overlap)
        const batch1 = Array.from({ length: 100 }, (_, i) =>
            makeRawMsg({ id: `b1-${i}`, timestamp: 50000 - i })
        );
        // Second call: return 30 messages (partial, exhausted)
        const batch2 = Array.from({ length: 30 }, (_, i) =>
            makeRawMsg({ id: `b2-${i}`, timestamp: 20000 - i })
        );

        client.fetchMessages
            .mockResolvedValueOnce(batch1)
            .mockResolvedValueOnce(batch2);

        const result = await engine.syncChat('5511999999999');

        expect(result.processed).toBe(130); // 100 + 30
        expect(client.fetchMessages).toHaveBeenCalledTimes(2);
        // Second call should use doubled batch size
        expect(client.fetchMessages).toHaveBeenNthCalledWith(1, '5511999999999', 100);
        expect(client.fetchMessages).toHaveBeenNthCalledWith(2, '5511999999999', 200);
    });

    it('stops when overlap found (all messages in second batch are known)', async () => {
        // Pre-seed with messages from the second batch range
        for (let i = 0; i < 10; i++) {
            await db.addMessage('5511999999999', {
                id: `false_b2-${i}@c.us`,
                timestamp: 20000 - i,
                body: 'existing',
                message: 'existing',
                type: 'chat',
                senderType: 'customer',
            });
        }

        const batch1 = Array.from({ length: 100 }, (_, i) =>
            makeRawMsg({ id: `b1-${i}`, timestamp: 50000 - i })
        );
        const batch2 = Array.from({ length: 10 }, (_, i) =>
            makeRawMsg({ id: `b2-${i}`, timestamp: 20000 - i })
        );

        client.fetchMessages
            .mockResolvedValueOnce(batch1)
            .mockResolvedValueOnce(batch2);

        const result = await engine.syncChat('5511999999999');

        expect(result.processed).toBe(100); // only batch1 processed
        expect(client.fetchMessages).toHaveBeenCalledTimes(2);
    });

    it('processes messages oldest-first within each batch', async () => {
        const msgs = [
            makeRawMsg({ id: '3', timestamp: 3000, body: 'newest' }),
            makeRawMsg({ id: '2', timestamp: 2000, body: 'middle' }),
            makeRawMsg({ id: '1', timestamp: 1000, body: 'oldest' }),
        ];
        client.fetchMessages.mockResolvedValue(msgs);

        await engine.syncChat('5511999999999');

        const calls = (processor.processIncomingMessage as jest.Mock).mock.calls;
        // Should be called oldest-first: msg 1, then 2, then 3
        expect(calls[0][0].body).toBe('oldest');
        expect(calls[1][0].body).toBe('middle');
        expect(calls[2][0].body).toBe('newest');
    });

    it('sets cursor after processing new messages', async () => {
        const msgs = [
            makeRawMsg({ id: 'newest', timestamp: 3000 }),
            makeRawMsg({ id: 'older', timestamp: 1000 }),
        ];
        client.fetchMessages.mockResolvedValue(msgs);

        await engine.syncChat('5511999999999');

        const cursor = await db.getSyncCursor('5511999999999');
        expect(cursor).not.toBeNull();
        expect(cursor!.lastMessageId).toBe('false_newest@c.us');
    });

    it('does not overwrite cursor when no new messages processed', async () => {
        await db.addMessage('5511999999999', {
            id: 'false_1@c.us',
            timestamp: 1000,
            body: 'hello',
            message: 'hello',
            type: 'chat',
            senderType: 'customer',
        });

        client.fetchMessages.mockResolvedValue([makeRawMsg({ id: '1' })]);

        await engine.syncChat('5511999999999');

        const cursor = await db.getSyncCursor('5511999999999');
        expect(cursor).toBeNull(); // no cursor set since nothing processed
    });

    it('downloads media for messages with hasMedia=true', async () => {
        const msgs = [makeRawMsg({ id: '1', hasMedia: true, type: 'image' })];
        client.fetchMessages.mockResolvedValue(msgs);
        client.downloadMedia.mockResolvedValue({
            mimetype: 'image/jpeg',
            data: 'base64data',
        });

        await engine.syncChat('5511999999999');

        expect(client.downloadMedia).toHaveBeenCalledWith('5511999999999', 'false_1@c.us');
        const inputArg = (processor.processIncomingMessage as jest.Mock).mock.calls[0][0];
        expect(inputArg.media).toEqual({
            data: 'base64data',
            mimetype: 'image/jpeg',
        });
    });

    it('maps fromMe=true → senderType human', async () => {
        const msgs = [makeRawMsg({ id: '1', fromMe: true })];
        client.fetchMessages.mockResolvedValue(msgs);

        await engine.syncChat('5511999999999');

        const inputArg = (processor.processIncomingMessage as jest.Mock).mock.calls[0][0];
        expect(inputArg.senderType).toBe('human');
    });

    it('maps fromMe=false → senderType customer', async () => {
        const msgs = [makeRawMsg({ id: '1', fromMe: false })];
        client.fetchMessages.mockResolvedValue(msgs);

        await engine.syncChat('5511999999999');

        const inputArg = (processor.processIncomingMessage as jest.Mock).mock.calls[0][0];
        expect(inputArg.senderType).toBe('customer');
    });

    // ── syncAll ────────────────────────────────────────────────────────

    it('syncs all chats from getChats', async () => {
        client.getChats.mockResolvedValue([
            { id: { _serialized: 'chat-a@c.us' } },
            { id: { _serialized: 'chat-b@c.us' } },
        ]);
        client.fetchMessages.mockResolvedValue([makeRawMsg({ id: '1' })]);

        const results = await engine.syncAll();

        expect(results).toHaveLength(2);
        expect(results[0].chatId).toBe('chat-a@c.us');
        expect(results[1].chatId).toBe('chat-b@c.us');
        expect(results[0].processed).toBe(1);
        expect(results[1].processed).toBe(1);
    });

    it('handles chat objects with different ID formats', async () => {
        // Pre-seed a chat to ensure listChatIds is not empty during this test
        await db.addMessage('some-existing-chat', {
            id: 'm1',
            timestamp: 1000,
            body: 'hello',
            message: 'hello',
            type: 'chat',
            senderType: 'customer',
        });

        client.getChats.mockResolvedValue([
            { id: { _serialized: 'a@c.us' } },
            { id: 'plain-id@g.us' },           // no _serialized, fallback to id
            { name: 'named-chat@c.us' },       // no id at all, fallback to name
        ]);
        client.fetchMessages.mockResolvedValue([]);

        const results = await engine.syncAll();

        expect(results).toHaveLength(3);
        expect(results[0].chatId).toBe('a@c.us');
        expect(results[1].chatId).toBe('plain-id@g.us');
        expect(results[2].chatId).toBe('named-chat@c.us');
    });

    it('syncAll downloads last 100 chats and last 100 messages of those chats first if empty', async () => {
        // DB is empty (no conversation files exist)
        // Set up 150 chats
        const manyChats = Array.from({ length: 150 }, (_, i) => ({
            id: { _serialized: `chat-${i}@c.us` },
        }));
        client.getChats.mockResolvedValue(manyChats);
        client.fetchMessages.mockResolvedValue([makeRawMsg({ id: '1' })]);

        const results = await engine.syncAll();

        // Should only process first 100 chats
        expect(results).toHaveLength(100);
        // The fetchMessages call should be called with limit 100 (initial sync limit)
        expect(client.fetchMessages).toHaveBeenNthCalledWith(1, 'chat-0@c.us', 100);
        expect(client.fetchMessages).toHaveBeenNthCalledWith(100, 'chat-99@c.us', 100);
    });

    // ── getSyncState ───────────────────────────────────────────────────

    it('returns sync state with cursor and message count', async () => {
        await db.addMessage('chat-x', {
            id: 'm1',
            timestamp: 1000,
            body: 'hello',
            message: 'hello',
            type: 'chat',
            senderType: 'customer',
        });
        await db.setSyncCursor('chat-x', { lastMessageId: 'm1', syncedAt: 5000 });

        const state = await engine.getSyncState('chat-x');

        expect(state.chatId).toBe('chat-x');
        expect(state.messageCount).toBe(1);
        expect(state.cursor).toEqual({ lastMessageId: 'm1', syncedAt: 5000 });
    });

    it('returns null cursor for never-synced chat', async () => {
        const state = await engine.getSyncState('new-chat');

        expect(state.cursor).toBeNull();
        expect(state.messageCount).toBe(0);
    });

    it('continues processing if a message processing throws error', async () => {
        const msgs = [
            makeRawMsg({ id: '1', timestamp: 1000 }),
            makeRawMsg({ id: '2', timestamp: 2000 }),
            makeRawMsg({ id: '3', timestamp: 3000 }),
        ];
        client.fetchMessages.mockResolvedValue(msgs);

        // Make the second message throw error during processing
        (processor.processIncomingMessage as jest.Mock).mockImplementation(async (input) => {
            if (input.id === 'false_2@c.us') {
                throw new Error('processing error');
            }
            return {};
        });

        const result = await engine.syncChat('5511999999999');

        // It should successfully process 2 and skip/fail the error one
        expect(result.processed).toBe(2);
        expect(processor.processIncomingMessage).toHaveBeenCalledTimes(3);
    });

    it('continues syncing other chats if one chat fails to sync in syncAll', async () => {
        client.getChats.mockResolvedValue([
            { id: { _serialized: 'chat-fail@c.us' } },
            { id: { _serialized: 'chat-success@c.us' } },
        ]);

        // Mock fetchMessages to throw for chat-fail and return messages for chat-success
        client.fetchMessages.mockImplementation(async (chatId) => {
            if (chatId === 'chat-fail@c.us') {
                throw new Error('fetch error');
            }
            return [makeRawMsg({ id: '1' })];
        });

        const results = await engine.syncAll();

        expect(results).toHaveLength(2);
        expect(results[0].chatId).toBe('chat-fail@c.us');
        expect(results[0].processed).toBe(0);
        expect(results[1].chatId).toBe('chat-success@c.us');
        expect(results[1].processed).toBe(1);
    });
});
