import express from 'express';
import { LocalDatabase, Message, SenderType } from './db/localDb';
import { SyncEngine } from './sync/syncEngine';
import path from 'path';

export function createApp(db: LocalDatabase, dbDir: string, syncEngine?: SyncEngine) {
    const app = express();
    app.use(express.json({ limit: '50mb' }));

    // List all conversation IDs
    app.get('/api/conversations', async (_req, res) => {
        try {
            const fs = await import('fs/promises');
            await fs.mkdir(dbDir, { recursive: true });
            const files = await fs.readdir(dbDir);
            const chatIds = files
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace(/\.json$/, ''));
            res.json(chatIds);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get conversation by chatId
    app.get('/api/conversations/:chatId', async (req, res) => {
        try {
            const convo = await db.getConversation(req.params.chatId);
            res.json(convo);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Add message to conversation
    app.post('/api/conversations/:chatId/messages', async (req, res) => {
        try {
            const { id, timestamp, body, message, type, senderType, transcription, description } = req.body;

            if (!id || !body || !senderType || !type) {
                res.status(400).json({ error: 'Missing required fields: id, body, senderType, type' });
                return;
            }

            const msg: Message = {
                id,
                timestamp: timestamp || Date.now(),
                body,
                message: message || body,
                type,
                senderType: senderType as SenderType,
                transcription,
                description,
            };

            await db.addMessage(req.params.chatId, msg);
            res.status(201).json(msg);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Update message in conversation
    app.patch('/api/conversations/:chatId/messages/:messageId', async (req, res) => {
        try {
            await db.updateMessage(req.params.chatId, req.params.messageId, req.body);
            const convo = await db.getConversation(req.params.chatId);
            const updated = convo.messages.find(m => m.id === req.params.messageId);
            res.json(updated);
        } catch (err: any) {
            if (err.message.includes('not found')) {
                res.status(404).json({ error: err.message });
            } else {
                res.status(500).json({ error: err.message });
            }
        }
    });

    // ── Sync routes (only when syncEngine is wired) ─────────────────

    if (syncEngine) {
        app.post('/api/sync/:chatId', async (req, res) => {
            try {
                const result = await syncEngine.syncChat(req.params.chatId);
                res.json(result);
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        app.post('/api/sync', async (_req, res) => {
            // Acknowledge the request immediately to avoid timeout
            res.status(202).json({ status: 'Sync started in background' });
            
            // Run sync in the background
            syncEngine.syncAll().catch(err => {
                console.error('[Server] Background sync failed:', err);
            });
        });

        app.get('/api/sync/state/:chatId', async (req, res) => {
            try {
                const state = await syncEngine.getSyncState(req.params.chatId);
                res.json(state);
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        app.get('/api/sync/state', async (_req, res) => {
            try {
                const chatIds = await db.listChatIds();
                const states: Record<string, unknown> = {};
                for (const chatId of chatIds) {
                    states[chatId] = await syncEngine.getSyncState(chatId);
                }
                res.json(states);
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });
    }

    // Get WhatsApp status and QR code from the persistent state file
    app.get('/api/whatsapp/state', async (_req, res) => {
        try {
            const fs = await import('fs/promises');
            const statePath = path.join(process.cwd(), 'tmp', 'whatsapp_state.json');
            try {
                const data = await fs.readFile(statePath, 'utf-8');
                res.json(JSON.parse(data));
            } catch (err: any) {
                if (err.code === 'ENOENT') {
                    res.json({ status: 'disconnected', qr: null, updatedAt: Date.now() });
                } else {
                    throw err;
                }
            }
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return app;
}

export {}
