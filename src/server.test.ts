import request from 'supertest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createApp } from './server';
import { LocalDatabase, Message } from './db/localDb';
import { SyncEngine } from './sync/syncEngine';
import { SyncResult, SyncState } from './sync/types';

describe('Server API', () => {
    const testDir = path.join(process.cwd(), 'tmp', 'test_server_db');
    let db: LocalDatabase;
    let app: ReturnType<typeof createApp>;

    beforeEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        await fs.mkdir(testDir, { recursive: true });
        db = new LocalDatabase(testDir);
        app = createApp(db, testDir);
    });

    afterAll(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('GET /api/conversations', () => {
        it('returns empty array when no conversations exist', async () => {
            const res = await request(app).get('/api/conversations');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it('returns list of conversation IDs', async () => {
            const msg: Message = { id: 'm1', timestamp: 1000, body: 'hi', message: 'hi', type: 'text', senderType: 'customer' };
            await db.addMessage('chat-a', msg);
            await db.addMessage('chat-b', msg);

            const res = await request(app).get('/api/conversations');
            expect(res.status).toBe(200);
            expect(res.body.sort()).toEqual(['chat-a', 'chat-b']);
        });
    });

    describe('GET /api/conversations/:chatId', () => {
        it('returns empty conversation for non-existent chat', async () => {
            const res = await request(app).get('/api/conversations/nonexistent');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ chatId: 'nonexistent', messages: [] });
        });

        it('returns conversation with messages', async () => {
            const msg: Message = { id: 'm1', timestamp: 1000, body: 'hello', message: 'hello', type: 'text', senderType: 'customer' };
            await db.addMessage('chat123', msg);

            const res = await request(app).get('/api/conversations/chat123');
            expect(res.status).toBe(200);
            expect(res.body.chatId).toBe('chat123');
            expect(res.body.messages).toHaveLength(1);
            expect(res.body.messages[0]).toEqual(msg);
        });
    });

    describe('POST /api/conversations/:chatId/messages', () => {
        it('creates a new message', async () => {
            const res = await request(app)
                .post('/api/conversations/chat1/messages')
                .send({ id: 'm1', body: 'hello', type: 'text', senderType: 'customer' });

            expect(res.status).toBe(201);
            expect(res.body.id).toBe('m1');
            expect(res.body.body).toBe('hello');
            expect(res.body.message).toBe('hello');

            const convo = await db.getConversation('chat1');
            expect(convo.messages).toHaveLength(1);
        });

        it('defaults message to body when not provided', async () => {
            const res = await request(app)
                .post('/api/conversations/chat1/messages')
                .send({ id: 'm1', body: 'custom body', type: 'text', senderType: 'customer' });

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('custom body');
        });

        it('accepts explicit message field', async () => {
            const res = await request(app)
                .post('/api/conversations/chat1/messages')
                .send({ id: 'm1', body: 'body text', message: 'explicit text', type: 'text', senderType: 'ai' });

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('explicit text');
        });

        it('returns 400 when required fields are missing', async () => {
            const res = await request(app)
                .post('/api/conversations/chat1/messages')
                .send({ id: 'm1' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Missing required fields');
        });

        it('returns 400 when only id and body provided (missing senderType)', async () => {
            const res = await request(app)
                .post('/api/conversations/chat1/messages')
                .send({ id: 'm1', body: 'hi', type: 'text' });

            expect(res.status).toBe(400);
        });

        it('returns 400 when only id and body provided (missing type)', async () => {
            const res = await request(app)
                .post('/api/conversations/chat1/messages')
                .send({ id: 'm1', body: 'hi', senderType: 'customer' });

            expect(res.status).toBe(400);
        });

        it('accepts optional transcription and description', async () => {
            const res = await request(app)
                .post('/api/conversations/chat1/messages')
                .send({
                    id: 'm1', body: 'audio msg', type: 'audio', senderType: 'customer',
                    transcription: 'transcribed text', description: 'audio description',
                });

            expect(res.status).toBe(201);
            expect(res.body.transcription).toBe('transcribed text');
            expect(res.body.description).toBe('audio description');
        });
    });

    describe('PATCH /api/conversations/:chatId/messages/:messageId', () => {
        it('updates message properties', async () => {
            const msg: Message = { id: 'm1', timestamp: 1000, body: 'original', message: 'original', type: 'text', senderType: 'customer' };
            await db.addMessage('chat1', msg);

            const res = await request(app)
                .patch('/api/conversations/chat1/messages/m1')
                .send({ body: 'updated', transcription: 'new transcript' });

            expect(res.status).toBe(200);
            expect(res.body.body).toBe('updated');
            expect(res.body.transcription).toBe('new transcript');
            expect(res.body.id).toBe('m1');
        });

        it('returns 404 when message not found', async () => {
            const res = await request(app)
                .patch('/api/conversations/chat1/messages/nonexistent')
                .send({ body: 'test' });

            expect(res.status).toBe(404);
            expect(res.body.error).toContain('not found');
        });

        it('returns 500 on unexpected update error', async () => {
            const msg: Message = { id: 'm1', timestamp: 1000, body: 'original', message: 'original', type: 'text', senderType: 'customer' };
            await db.addMessage('chat1', msg);

            jest.spyOn(db, 'updateMessage').mockRejectedValueOnce(new Error('disk full'));
            const res = await request(app)
                .patch('/api/conversations/chat1/messages/m1')
                .send({ body: 'test' });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('disk full');
        });
    });

    describe('error handling', () => {
        it('returns 500 when listing conversations fails', async () => {
            // Create app with dbDir pointing to a file to trigger readdir error
            await fs.writeFile(path.join(testDir, 'notadir'), '');
            const brokenApp = createApp(db, path.join(testDir, 'notadir'));
            const res = await request(brokenApp).get('/api/conversations');
            expect(res.status).toBe(500);
        });

        it('returns 500 when getConversation throws non-ENOENT error', async () => {
            // Corrupt JSON in file to trigger parse error
            await fs.mkdir(testDir, { recursive: true });
            await fs.writeFile(path.join(testDir, 'bad.json'), 'not-json{');
            const res = await request(app).get('/api/conversations/bad');
            expect(res.status).toBe(500);
        });

        it('returns 500 when addMessage fails', async () => {
            jest.spyOn(db, 'addMessage').mockRejectedValueOnce(new Error('write error'));
            const res = await request(app)
                .post('/api/conversations/chat1/messages')
                .send({ id: 'm1', body: 'hello', type: 'text', senderType: 'customer' });
            expect(res.status).toBe(500);
            expect(res.body.error).toBe('write error');
        });
    });

    describe('sync routes', () => {
        let syncEngine: jest.Mocked<SyncEngine>;
        let syncApp: ReturnType<typeof createApp>;

        beforeEach(async () => {
            await fs.rm(testDir, { recursive: true, force: true });
            await fs.mkdir(testDir, { recursive: true });
            db = new LocalDatabase(testDir);

            syncEngine = {
                syncChat: jest.fn(),
                syncAll: jest.fn(),
                getSyncState: jest.fn(),
            } as any;

            syncApp = createApp(db, testDir, syncEngine);
        });

        describe('POST /api/sync/:chatId', () => {
            it('returns sync result for a single chat', async () => {
                syncEngine.syncChat.mockResolvedValue({
                    chatId: '5511999999999',
                    processed: 5,
                    skipped: 0,
                });

                const res = await request(syncApp).post('/api/sync/5511999999999');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({
                    chatId: '5511999999999',
                    processed: 5,
                    skipped: 0,
                });
                expect(syncEngine.syncChat).toHaveBeenCalledWith('5511999999999');
            });

            it('returns 500 when syncChat throws', async () => {
                syncEngine.syncChat.mockRejectedValue(new Error('connection lost'));

                const res = await request(syncApp).post('/api/sync/bad-chat');

                expect(res.status).toBe(500);
                expect(res.body.error).toBe('connection lost');
            });
        });

        describe('POST /api/sync', () => {
            it('returns results for all chats', async () => {
                syncEngine.syncAll.mockResolvedValue([
                    { chatId: 'a', processed: 3, skipped: 0 },
                    { chatId: 'b', processed: 0, skipped: 10 },
                ]);

                const res = await request(syncApp).post('/api/sync');

                expect(res.status).toBe(200);
                expect(res.body).toHaveLength(2);
                expect(res.body[0].chatId).toBe('a');
            });

            it('returns 500 when syncAll throws', async () => {
                syncEngine.syncAll.mockRejectedValue(new Error('not connected'));

                const res = await request(syncApp).post('/api/sync');

                expect(res.status).toBe(500);
                expect(res.body.error).toBe('not connected');
            });
        });

        describe('GET /api/sync/state/:chatId', () => {
            it('returns sync state for a chat', async () => {
                syncEngine.getSyncState.mockResolvedValue({
                    chatId: 'chat-x',
                    cursor: { lastMessageId: 'm99', syncedAt: 5000 },
                    messageCount: 42,
                });

                const res = await request(syncApp).get('/api/sync/state/chat-x');

                expect(res.status).toBe(200);
                expect(res.body.messageCount).toBe(42);
                expect(res.body.cursor.lastMessageId).toBe('m99');
            });

            it('returns 500 when getSyncState throws', async () => {
                syncEngine.getSyncState.mockRejectedValue(new Error('db error'));

                const res = await request(syncApp).get('/api/sync/state/chat-x');

                expect(res.status).toBe(500);
                expect(res.body.error).toBe('db error');
            });
        });

        describe('GET /api/sync/state', () => {
            it('returns all chat states', async () => {
                await db.saveConversation('chat-a', []);
                await db.saveConversation('chat-b', []);

                syncEngine.getSyncState.mockImplementation(async (chatId: string) => ({
                    chatId,
                    cursor: null,
                    messageCount: 0,
                }));

                const res = await request(syncApp).get('/api/sync/state');

                expect(res.status).toBe(200);
                expect(res.body).toHaveProperty('chat-a');
                expect(res.body).toHaveProperty('chat-b');
                expect(res.body['chat-a'].messageCount).toBe(0);
            });

            it('returns 500 when listChatIds fails', async () => {
                jest.spyOn(db, 'listChatIds').mockRejectedValue(new Error('io error'));

                const res = await request(syncApp).get('/api/sync/state');

                expect(res.status).toBe(500);
                expect(res.body.error).toBe('io error');
            });
        });
    });

    describe('GET /api/whatsapp/state', () => {
        const statePath = path.join(process.cwd(), 'tmp', 'whatsapp_state.json');

        afterEach(async () => {
            await fs.rm(statePath, { force: true });
        });

        it('returns disconnected default status if file does not exist', async () => {
            await fs.rm(statePath, { force: true });
            const res = await request(app).get('/api/whatsapp/state');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('disconnected');
            expect(res.body.qr).toBeNull();
        });

        it('returns saved status from persistent state file', async () => {
            const sampleState = { status: 'qr', qr: 'test-qr-string', updatedAt: Date.now() };
            await fs.mkdir(path.dirname(statePath), { recursive: true });
            await fs.writeFile(statePath, JSON.stringify(sampleState), 'utf-8');

            const res = await request(app).get('/api/whatsapp/state');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('qr');
            expect(res.body.qr).toBe('test-qr-string');
        });
    });
});
