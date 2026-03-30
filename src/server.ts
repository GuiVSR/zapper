import 'dotenv/config';
import { SERVER_PORT, DEFAULT_HISTORY_LIMIT, DEFAULT_SEARCH_LIMIT, DEFAULT_CHATS_LIMIT } from './constants';
import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { WhatsAppClient } from './client';
import { MessageHandler } from './handlers/messageHandler';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// ── WhatsApp client ───────────────────────────────────────────────────────────
const whatsappClient = new WhatsAppClient({
    headless: true,
    onQR: (qr: string) => {
        console.log('📱 QR Code received, sending to frontend...');
        io.emit('qr', { qr });
    },
    onReady: () => {
        console.log('✅ WhatsApp client is ready!');
        io.emit('ready', { message: 'WhatsApp is connected and ready!' });
    },
    onMessage: async (message) => {
        io.emit('message', {
            id:       message.id.id,
            from:     message.from,
            to:       message.to,
            body:     message.body,
            timestamp: message.timestamp,
            type:     message.type,
            fromMe:   message.fromMe,
            hasMedia: message.hasMedia,
        });

        await messageHandler.handleMessage(message);

        if (message.hasMedia) {
            try {
                const media = await message.downloadMedia();
                if (media) {
                    io.emit('media', {
                        messageId: message.id.id,
                        from:      message.from,
                        mimetype:  media.mimetype,
                        data:      media.data,
                    });
                }
            } catch { /* non-critical */ }
        }
    },
    onSticker: (stickerInfo) => {
        console.log(`🎨 Sticker received from ${stickerInfo.message.from}`);
        io.emit('sticker', {
            from: stickerInfo.message.from,
            isAnimated: stickerInfo.isAnimated,
            fileSize: stickerInfo.fileSize,
            dimensions: stickerInfo.dimensions,
            data: stickerInfo.data.toString('base64'),
            savedPath: stickerInfo.savedPath,
        });
    },
    onAuthFailure: (msg) => {
        console.error('❌ Auth failure:', msg);
        io.emit('auth_failure', { message: msg });
    },
    onDisconnected: (reason) => {
        console.log('❌ Disconnected:', reason);
        io.emit('disconnected', { reason });
    },
    onError: (error) => {
        console.error('❌ Error:', error);
        io.emit('error', { message: error.message });
    },
});

// ── Message handler ───────────────────────────────────────────────────────────
const messageHandler = new MessageHandler(
    whatsappClient,
    process.env.WEBHOOK_URL,
    (draft) => {
        console.log(`[Server] Emitting ai_draft for chat ${draft.chatId} (${draft.parts.length} part(s))`);
        io.emit('ai_draft', draft);
    }
);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ── API routes ────────────────────────────────────────────────────────────────
app.get('/api/test', (_req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

app.get('/api/status', (_req, res) => {
    res.json({
        ready: whatsappClient.isReady(),
        timestamp: new Date().toISOString(),
    });
});

app.get('/api/chats', async (_req, res) => {
    if (!whatsappClient.isReady()) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }
    try {
        const chats = await whatsappClient.getChats();
        res.json(
            chats.map(chat => ({
                id: chat.id._serialized,
                name: chat.name || chat.id.user || 'Unknown',
                isGroup: chat.isGroup,
                unreadCount: chat.unreadCount,
                timestamp: chat.timestamp,
            }))
        );
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch chats', details: err.message });
    }
});

app.get('/api/history/:chatId', async (req, res) => {
    if (!whatsappClient.isReady()) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit as string) || DEFAULT_HISTORY_LIMIT;
        const history = await whatsappClient.getChatHistory(chatId, limit);
        const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
        res.json({ chatId, count: sorted.length, messages: sorted });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch chat history', details: err.message });
    }
});

app.get('/api/search', async (req, res) => {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query parameter "q"' });
    if (!whatsappClient.isReady()) return res.status(503).json({ error: 'WhatsApp client not ready' });
    try {
        const results = await whatsappClient.searchMessages(q as string, parseInt(limit as string) || DEFAULT_SEARCH_LIMIT);
        res.json({ query: q, count: results.length, results });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to search messages', details: err.message });
    }
});

app.get('/api/chats-with-messages', async (req, res) => {
    if (!whatsappClient.isReady()) return res.status(503).json({ error: 'WhatsApp client not ready' });
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const chatsWithMessages = await whatsappClient.getAllChatsWithMessages(limit);
        const formatted = Array.from(chatsWithMessages.entries()).map(([chatId, messages]) => ({
            chatId,
            messageCount: messages.length,
            messages: messages.slice(0, 10),
        }));
        res.json({ count: formatted.length, chats: formatted });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch chats with messages', details: err.message });
    }
});

app.get('/api/conversation/:number', async (req, res) => {
    if (!whatsappClient.isReady()) return res.status(503).json({ error: 'WhatsApp client not ready' });
    try {
        const { number } = req.params;
        const limit = parseInt(req.query.limit as string) || DEFAULT_HISTORY_LIMIT;
        let chatId = number;
        if (!chatId.includes('@') && !chatId.includes('-')) {
            chatId = `${chatId.replace(/[^0-9+]/g, '')}@c.us`;
        }
        const history = await whatsappClient.getChatHistory(chatId, limit);
        let contactInfo = null;
        try { contactInfo = await whatsappClient.getContactInfo(chatId); } catch { /* ok */ }
        res.json({ contact: number, contactInfo, count: history.length, messages: history });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch conversation', details: err.message });
    }
});

app.post('/api/send-message', async (req, res) => {
    const { to, message } = req.body;
    if (!whatsappClient.isReady()) return res.status(503).json({ error: 'WhatsApp client not ready' });
    if (!to || !message) return res.status(400).json({ error: 'Missing "to" or "message" field' });
    try {
        const result = await whatsappClient.sendMessage(to, message);
        // Mark all messages in the chat as read
        whatsappClient.markChatAsRead(to).catch(() => {/* non-critical */});
        res.json({ success: true, message: 'Message sent successfully', id: result.id.id });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to send message', details: err.message });
    }
});

app.get('/api/media', async (req, res) => {
    if (!whatsappClient.isReady()) return res.status(503).json({ error: 'WhatsApp client not ready' });
    const serializedId = req.query.id as string;
    if (!serializedId) return res.status(400).json({ error: 'Missing "id" query parameter' });
    try {
        const media = await whatsappClient.getMessageMedia(decodeURIComponent(serializedId));
        if (!media) return res.status(404).json({ error: 'No media found for this message' });
        res.json({ messageId: serializedId, mimetype: media.mimetype, data: media.data });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch media', details: err.message });
    }
});

app.post('/api/logout', async (_req, res) => {
    try {
        await whatsappClient.logout();
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to logout', details: err.message });
    }
});

// Update runtime settings (e.g. maxDraftParts) without triggering a generation
app.post('/api/settings', (req, res) => {
    const { maxDraftParts } = req.body;
    if (typeof maxDraftParts === 'number' && maxDraftParts >= 1) {
        messageHandler.maxDraftParts = Math.floor(maxDraftParts);
        console.log(`[Settings] maxDraftParts updated to ${messageHandler.maxDraftParts}`);
    }
    res.json({ maxDraftParts: messageHandler.maxDraftParts });
});

// Generate AI draft on demand for one or more chats
// Body: { chatIds: string[], limit?: number, maxDraftParts?: number }
app.post('/api/generate-drafts', async (req, res) => {
    const { chatIds, limit, maxDraftParts } = req.body;
    if (!whatsappClient.isReady()) return res.status(503).json({ error: 'WhatsApp client not ready' });
    if (!Array.isArray(chatIds) || chatIds.length === 0) return res.status(400).json({ error: 'Missing or empty "chatIds" array' });

    const messageLimit  = typeof limit         === 'number' && limit         > 0  ? limit         : 10;
    const partsLimit    = typeof maxDraftParts  === 'number' && maxDraftParts >= 1 ? maxDraftParts : undefined;

    messageHandler.generateDraftsForChats(chatIds, messageLimit, partsLimit)
        .catch(err => console.error('[Server] generate-drafts error:', err));

    res.json({ accepted: chatIds.length, limit: messageLimit, maxDraftParts: partsLimit });
});

// ── Static file serving ───────────────────────────────────────────────────────
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ── WhatsApp init ─────────────────────────────────────────────────────────────
console.log('🚀 Starting WhatsApp client...');
whatsappClient.initialize().catch(err => {
    console.error('Failed to initialize WhatsApp client:', err);
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);
    socket.emit('ready', { message: 'Connected to WhatsApp server!' });
    if (whatsappClient.isReady()) {
        socket.emit('client_ready', { message: 'WhatsApp client is already ready!' });
    }

    socket.on('get_chats', async () => {
        if (!whatsappClient.isReady()) return socket.emit('error', { message: 'WhatsApp client not ready' });
        const chats = await whatsappClient.getChats();
        socket.emit('chats_list', chats.map(c => ({
            id: c.id._serialized,
            name: c.name,
            isGroup: c.isGroup,
            unreadCount: c.unreadCount,
        })));
    });

    socket.on('get_chat_history', async ({ chatId, limit = 50 }) => {
        if (!whatsappClient.isReady()) return socket.emit('error', { message: 'WhatsApp client not ready' });
        try {
            const history = await whatsappClient.getChatHistory(chatId, limit);
            socket.emit('chat_history', { chatId, count: history.length, messages: history });
        } catch (err: any) {
            socket.emit('error', { message: `Failed to fetch chat history: ${err.message}` });
        }
    });

    socket.on('send_message', async ({ to, message }) => {
        if (!whatsappClient.isReady()) return socket.emit('error', { message: 'WhatsApp client not ready' });
        try {
            await whatsappClient.sendMessage(to, message);
            socket.emit('message_sent', { success: true, to, message });
        } catch {
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = SERVER_PORT;
server.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`\n📱 API endpoints:`);
    console.log(`   GET  /api/test`);
    console.log(`   GET  /api/status`);
    console.log(`   GET  /api/chats`);
    console.log(`   GET  /api/history/:chatId`);
    console.log(`   GET  /api/search?q=query`);
    console.log(`   GET  /api/chats-with-messages`);
    console.log(`   GET  /api/conversation/:number`);
    console.log(`   POST /api/send-message`);
    console.log(`   POST /api/generate-drafts`);
    console.log(`\n🤖 Socket events emitted:`);
    console.log(`   ai_draft  — AI draft ready for review`);
});

process.on('SIGTERM', () => { messageHandler.destroy(); process.exit(0); });
process.on('SIGINT',  () => { messageHandler.destroy(); process.exit(0); });