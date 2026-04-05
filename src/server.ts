import 'dotenv/config';
import { SERVER_PORT, DEFAULT_HISTORY_LIMIT, DEFAULT_SEARCH_LIMIT, DEFAULT_CHATS_LIMIT } from './constants';
import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { WhatsAppClient, ALLOWED_MEDIA_TYPES } from './client';
import { MessageHandler } from './messaging/messageHandler';
import cors from 'cors';
import { testConnection, closePool } from './db';
import { createSession, closeSession } from './db';
import { createPromptLog, updatePromptAction, createPartAction } from './db';
import { getCachedName, refreshContactNames } from './contacts/contacts_cache';

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// ── Sessão DB ─────────────────────────────────────────────────────────────────
let currentSessionId: string | null = null;

// ── Mapa de prompt log IDs ────────────────────────────────────────────────────
const pendingPromptLogIds = new Map<string, string>();

// ── Startup draft suppression ─────────────────────────────────────────────────
// Ao conectar, o whatsapp-web.js replaya todas as mensagens recentes do histórico
// como eventos 'message'. Sem esta janela, o pooler geraria drafts para conversas
// já lidas/respondidas antes do operador sequer abrir o app.
//
// Funcionamento: quando onReady dispara, gravamos um timestamp futuro em
// `startupSuppressUntil`. O callback onDraft verifica esse timestamp e descarta
// silenciosamente qualquer draft gerado antes de ele expirar.
//
// STARTUP_QUIET_MS: tempo em ms após o onReady em que drafts são suprimidos.
// 15s cobre a maioria das contas. Aumente para contas com muitas mensagens.
const STARTUP_QUIET_MS = 15_000;
let startupSuppressUntil = 0; // epoch ms — 0 = sem supressão ativa

// ── WhatsApp client ───────────────────────────────────────────────────────────
const whatsappClient = new WhatsAppClient({
    headless: true,
    onQR: (qr: string) => {
        console.log('📱 QR Code received, sending to frontend...');
        io.emit('qr', { qr });
    },
    onReady: async () => {
        console.log('✅ WhatsApp client is ready!');
        io.emit('ready', { message: 'WhatsApp is connected and ready!' });

        // Ativa a janela de supressão de drafts
        startupSuppressUntil = Date.now() + STARTUP_QUIET_MS;
        console.log(`[Pooler] 🔕 Draft generation suppressed for ${STARTUP_QUIET_MS / 1000}s (startup sync window)`);

        // Cria uma nova sessão no banco a cada reconexão
        const session = await createSession({ meta: { node_env: process.env.NODE_ENV } });
        if (session) {
            currentSessionId = session.id;
            console.log(`[DB] Session created: ${currentSessionId}`);
        }

        // Kick off background contact name resolution
        whatsappClient.getChats().then(chats => {
            const nonGroupIds = chats
                .filter(c => !c.isGroup)
                .map(c => c.id._serialized);
            refreshContactNames(whatsappClient, nonGroupIds);
        }).catch(() => {/* non-critical */});
    },
    onMessage: async (message) => {
        io.emit('message', {
            id:           message.id.id,
            serializedId: message.id._serialized,
            from:         message.from,
            to:           message.to,
            body:         message.body,
            timestamp:    message.timestamp,
            type:         message.type,
            fromMe:       message.fromMe,
            hasMedia:     message.hasMedia,
        });

        await messageHandler.handleMessage(message);

        if (!message.fromMe && !message.from.includes('-')) {
            refreshContactNames(whatsappClient, [message.from]);
        }

        if (message.hasMedia && message.type !== 'sticker') {
            try {
                const media = await message.downloadMedia();
                if (media) {
                    io.emit('media', {
                        messageId: message.id.id,
                        from:      message.from,
                        mimetype:  media.mimetype,
                        data:      media.data,
                        filename:  media.filename || null,
                    });
                }
            } catch { /* non-critical */ }
        }
    },
    onSticker: (stickerInfo) => {
        console.log(`🎨 Sticker received from ${stickerInfo.message.from}`);
        io.emit('media', {
            messageId:  stickerInfo.message.id.id,
            from:       stickerInfo.message.from,
            mimetype:   stickerInfo.mimeType,
            data:       stickerInfo.data.toString('base64'),
            filename:   null,
            isSticker:  true,
            isAnimated: stickerInfo.isAnimated,
        });
    },
    onAuthFailure: (msg) => {
        console.error('❌ Auth failure:', msg);
        io.emit('auth_failure', { message: msg });
    },
    onDisconnected: async (reason) => {
        console.log('❌ Disconnected:', reason);
        io.emit('disconnected', { reason });

        if (currentSessionId) {
            await closeSession(currentSessionId);
            currentSessionId = null;
        }
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
    // onDraft — verifica a janela de supressão antes de emitir qualquer draft
    async (draft: import('./messaging/types').AIDraft) => {
        if (Date.now() < startupSuppressUntil) {
            const remainingSec = Math.ceil((startupSuppressUntil - Date.now()) / 1000);
            console.log(`[Pooler] 🔕 Draft suppressed during startup (${remainingSec}s remaining) — chat: ${draft.chatId}`);
            return;
        }

        console.log(`[Server] Emitting ai_draft for chat ${draft.chatId} (${draft.parts.length} part(s))`);

        const promptLogId = await createPromptLog({
            session_id:             currentSessionId,
            chat_id:                draft.chatId,
            llm_provider:           process.env.LLM_PROVIDER ?? 'groq',
            llm_model:              process.env.GROQ_MODEL
                                        ?? process.env.GEMINI_MODEL
                                        ?? process.env.DEEPSEEK_MODEL
                                        ?? null,
            parts_count:            draft.parts.length,
            draft_text:             draft.parts.join('\n\n'),
            draft_parts:            draft.parts,
            context_messages_count: draft.basedOnMessages.length,
            auto_generated:         draft.autoGenerated ?? true,
            generated_at:           new Date(draft.generatedAt * 1000),
        });

        if (promptLogId) {
            pendingPromptLogIds.set(draft.chatId, promptLogId);
            console.log(`[DB] prompt_log saved: ${promptLogId}`);
        }

        io.emit('ai_draft', { ...draft, promptLogId });
    },
    (data) => {
        console.log(`[Server] Emitting transcription for message ${data.messageId}`);
        io.emit('transcription', data);
    }
);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
        ready:             whatsappClient.isReady(),
        sessionId:         currentSessionId,
        startupSuppressed: Date.now() < startupSuppressUntil,
        timestamp:         new Date().toISOString(),
    });
});

// ── GET /api/chats ────────────────────────────────────────────────────────────
// Suporta paginação via ?limit=N&offset=N.
// Resposta inclui `total` e `hasMore` para o frontend controlar o botão
// "Load more".
const CHATS_PAGE_SIZE = 30;

app.get('/api/chats', async (req, res) => {
    if (!whatsappClient.isReady()) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }
    try {
        const limit  = Math.min(parseInt(req.query.limit  as string) || CHATS_PAGE_SIZE, 200);
        const offset = parseInt(req.query.offset as string) || 0;

        const allChats = await whatsappClient.getChats();
        const total    = allChats.length;
        const page     = allChats.slice(offset, offset + limit);

        // Dispara refresh de nomes em background só para os chats da página atual
        const nonGroupIds = page.filter(c => !c.isGroup).map(c => c.id._serialized);
        refreshContactNames(whatsappClient, nonGroupIds);

        res.json({
            chats: page.map(chat => {
                const cachedName = !chat.isGroup
                    ? getCachedName(chat.id._serialized)
                    : undefined;
                return {
                    id:          chat.id._serialized,
                    name:        cachedName || chat.name || chat.id.user || 'Unknown',
                    isGroup:     chat.isGroup,
                    unreadCount: chat.unreadCount,
                    timestamp:   chat.timestamp,
                };
            }),
            total,
            offset,
            limit,
            hasMore: offset + limit < total,
        });
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
        const sorted  = [...history].sort((a, b) => a.timestamp - b.timestamp);
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
            messages:     messages.slice(0, 10),
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
        whatsappClient.markChatAsRead(to).catch(() => {/* non-critical */});
        res.json({ success: true, message: 'Message sent successfully', id: result.id.id });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to send message', details: err.message });
    }
});

app.post('/api/send-media', async (req, res) => {
    const { to, data, mimetype, filename, caption } = req.body;
    if (!whatsappClient.isReady()) return res.status(503).json({ error: 'WhatsApp client not ready' });
    if (!to || !data || !mimetype || !filename) {
        return res.status(400).json({ error: 'Missing required fields: to, data, mimetype, filename' });
    }
    if (!ALLOWED_MEDIA_TYPES.has(mimetype)) {
        return res.status(400).json({
            error: `Unsupported file type: ${mimetype}`,
            allowed: Array.from(ALLOWED_MEDIA_TYPES),
        });
    }
    try {
        const result = await whatsappClient.sendMedia(to, data, mimetype, filename, caption);
        whatsappClient.markChatAsRead(to).catch(() => {/* non-critical */});
        res.json({ success: true, message: 'Media sent successfully', id: result.id.id });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to send media', details: err.message });
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

app.post('/api/settings', (req, res) => {
    const { maxDraftParts } = req.body;
    if (typeof maxDraftParts === 'number' && maxDraftParts >= 1) {
        messageHandler.maxDraftParts = Math.floor(maxDraftParts);
        console.log(`[Settings] maxDraftParts updated to ${messageHandler.maxDraftParts}`);
    }
    res.json({ maxDraftParts: messageHandler.maxDraftParts });
});

app.post('/api/generate-drafts', async (req, res) => {
    const { chatIds, limit, maxDraftParts } = req.body;
    if (!whatsappClient.isReady()) return res.status(503).json({ error: 'WhatsApp client not ready' });
    if (!Array.isArray(chatIds) || chatIds.length === 0) return res.status(400).json({ error: 'Missing or empty "chatIds" array' });

    const messageLimit = typeof limit        === 'number' && limit        > 0  ? limit        : 10;
    const partsLimit   = typeof maxDraftParts === 'number' && maxDraftParts >= 1 ? maxDraftParts : undefined;

    messageHandler.generateDraftsForChats(chatIds, messageLimit, partsLimit)
        .catch(err => console.error('[Server] generate-drafts error:', err));

    res.json({ accepted: chatIds.length, limit: messageLimit, maxDraftParts: partsLimit });
});

app.post('/api/draft-action', async (req, res) => {
    const { promptLogId, chatId, action, sentParts, originalParts, partActions } = req.body;

    const resolvedId: string | undefined =
        promptLogId ?? (chatId ? pendingPromptLogIds.get(chatId) : undefined);

    if (!resolvedId) {
        return res.status(400).json({ error: 'promptLogId not found.' });
    }

    if (!action || !['sent', 'edited', 'discarded', 'partial'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be: sent | edited | discarded | partial' });
    }

    try {
        const parts: string[]     = Array.isArray(sentParts)     ? sentParts     : [];
        const originals: string[] = Array.isArray(originalParts) ? originalParts : [];

        const editedIndices: number[] = parts.reduce<number[]>((acc, text, idx) => {
            if (originals[idx] !== undefined && text !== originals[idx]) acc.push(idx);
            return acc;
        }, []);

        const wasEdited = editedIndices.length > 0;
        const sentText  = parts.join('\n\n') || null;

        await updatePromptAction(resolvedId, {
            action,
            sent_text:           sentText,
            sent_parts:          parts,
            sent_parts_count:    parts.length,
            was_edited:          wasEdited,
            edited_part_indices: editedIndices,
            action_at:           new Date(),
        });

        if (Array.isArray(partActions) && partActions.length > 0) {
            for (const pa of partActions) {
                await createPartAction({
                    prompt_log_id: resolvedId,
                    part_index:    pa.partIndex,
                    original_text: pa.originalText,
                    final_text:    pa.finalText ?? null,
                    action:        pa.action,
                    was_edited:    pa.finalText !== pa.originalText,
                });
            }
        }

        if (chatId) pendingPromptLogIds.delete(chatId);

        console.log(`[DB] draft-action recorded — promptLogId: ${resolvedId}, action: ${action}, edited: ${wasEdited}`);

        res.json({
            success:           true,
            promptLogId:       resolvedId,
            action,
            wasEdited,
            editedPartIndices: editedIndices,
            sentPartsCount:    parts.length,
        });
    } catch (err: any) {
        console.error('[DB] draft-action error:', err.message);
        res.status(500).json({ error: 'Failed to record draft action', details: err.message });
    }
});

// ── Static file serving ───────────────────────────────────────────────────────
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ── WhatsApp + DB init ────────────────────────────────────────────────────────
console.log('🚀 Starting WhatsApp client...');

testConnection().then(ok => {
    if (!ok) console.warn('⚠️  Continuing without DB — prompt logs will not be saved.');
});

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
            id:          c.id._serialized,
            name:        c.name,
            isGroup:     c.isGroup,
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
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://<your-ip>:${PORT}`);
    console.log(`\n📱 API endpoints:`);
    console.log(`   GET  /api/test`);
    console.log(`   GET  /api/status`);
    console.log(`   GET  /api/chats?limit=30&offset=0`);
    console.log(`   GET  /api/history/:chatId`);
    console.log(`   GET  /api/search?q=query`);
    console.log(`   GET  /api/chats-with-messages`);
    console.log(`   GET  /api/conversation/:number`);
    console.log(`   POST /api/send-message`);
    console.log(`   POST /api/send-media`);
    console.log(`   POST /api/generate-drafts`);
    console.log(`   POST /api/draft-action`);
    console.log(`\n🤖 Socket events emitted:`);
    console.log(`   ai_draft      — AI draft ready for review (inclui promptLogId)`);
    console.log(`   transcription — Audio transcription ready`);
});

// ── Shutdown gracioso ─────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
    messageHandler.destroy();
    if (currentSessionId) await closeSession(currentSessionId);
    await closePool();
    process.exit(0);
});

process.on('SIGINT', async () => {
    messageHandler.destroy();
    if (currentSessionId) await closeSession(currentSessionId);
    await closePool();
    process.exit(0);
});