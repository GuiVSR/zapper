import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { WhatsAppClient } from './client';

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Initialize WhatsApp client
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
        console.log(`📨 Message received from ${message.from}: ${message.body}`);
        
        io.emit('message', {
            id: message.id.id,
            from: message.from,
            body: message.body,
            timestamp: message.timestamp,
            type: message.type,
            hasMedia: message.hasMedia
        });
        
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            if (media) {
                io.emit('media', {
                    messageId: message.id.id,
                    from: message.from,
                    mimetype: media.mimetype,
                    data: media.data
                });
            }
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
            savedPath: stickerInfo.savedPath
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
    }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log all requests for debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ========== API ROUTES ==========
// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

// Status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        ready: whatsappClient.isReady(),
        initialized: whatsappClient.isReady(),
        timestamp: new Date().toISOString()
    });
});

// Get all chats
app.get('/api/chats', async (req, res) => {
    try {
        console.log('📱 GET /api/chats - Fetching chats...');
        
        if (!whatsappClient.isReady()) {
            console.log('⚠️ Client not ready yet');
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }
        
        const chats = await whatsappClient.getChats();
        console.log(`✅ Found ${chats.length} chats`);
        
        const simplifiedChats = chats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name || chat.id.user || 'Unknown',
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp
        }));
        
        res.json(simplifiedChats);
    } catch (error: any) {
        console.error('Error fetching chats:', error);
        res.status(500).json({ error: 'Failed to fetch chats', details: error.message });
    }
});

// Get chat history for a specific chat
app.get('/api/history/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;
        
        console.log(`📜 GET /api/history/${chatId} - Fetching history (limit: ${limit})`);
        
        if (!whatsappClient.isReady()) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }
        
        const history = await whatsappClient.getChatHistory(chatId, limit);

        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
        
        res.json({
            chatId,
            count: sortedHistory.length,
            messages: sortedHistory
        });
    } catch (error: any) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch chat history', details: error.message });
    }
});

// Search messages
app.get('/api/search', async (req, res) => {
    try {
        const { q, limit } = req.query;
        
        if (!q) {
            return res.status(400).json({ error: 'Missing search query parameter "q"' });
        }
        
        if (!whatsappClient.isReady()) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }
        
        const limitNum = limit ? parseInt(limit as string) : 50;
        console.log(`🔍 GET /api/search - Searching for: "${q}"`);
        
        const results = await whatsappClient.searchMessages(q as string, limitNum);
        
        res.json({
            query: q,
            count: results.length,
            results
        });
    } catch (error: any) {
        console.error('Error searching messages:', error);
        res.status(500).json({ error: 'Failed to search messages', details: error.message });
    }
});

// Get all chats with messages
app.get('/api/chats-with-messages', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        
        if (!whatsappClient.isReady()) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }
        
        console.log(`📜 GET /api/chats-with-messages - Fetching all chats (limit: ${limit})`);
        const chatsWithMessages = await whatsappClient.getAllChatsWithMessages(limit);
        
        const formatted = Array.from(chatsWithMessages.entries()).map(([chatId, messages]) => ({
            chatId,
            messageCount: messages.length,
            messages: messages.slice(0, 10)
        }));
        
        res.json({
            count: formatted.length,
            chats: formatted
        });
    } catch (error: any) {
        console.error('Error fetching chats with messages:', error);
        res.status(500).json({ error: 'Failed to fetch chats with messages', details: error.message });
    }
});

// Get conversation with a specific contact
app.get('/api/conversation/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;
        
        if (!whatsappClient.isReady()) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }
        
        let chatId = number;
        if (!chatId.includes('@') && !chatId.includes('-')) {
            chatId = `${chatId.replace(/[^0-9+]/g, '')}@c.us`;
        }
        
        console.log(`📜 GET /api/conversation/${number} - Fetching conversation`);
        const history = await whatsappClient.getChatHistory(chatId, limit);
        
        let contactInfo = null;
        try {
            contactInfo = await whatsappClient.getContactInfo(chatId);
        } catch (error) {
            // Contact info not available
        }
        
        res.json({
            contact: number,
            contactInfo,
            count: history.length,
            messages: history
        });
    } catch (error: any) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({ error: 'Failed to fetch conversation', details: error.message });
    }
});

// Send message
app.post('/api/send-message', async (req, res) => {
    const { to, message } = req.body;
    
    console.log(`📤 POST /api/send-message - Sending to: ${to}, message: ${message}`);
    
    try {
        if (!whatsappClient.isReady()) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }
        
        if (!to || !message) {
            return res.status(400).json({ error: 'Missing "to" or "message" field' });
        }
        
        const result = await whatsappClient.sendMessage(to, message);
        console.log(`✅ Message sent successfully!`);
        res.json({ success: true, message: 'Message sent successfully', id: result.id.id });
    } catch (error: any) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
});

// ========== STATIC FILE SERVING ==========
// Serve static files from the public directory
const publicPath = path.join(__dirname, '../public');
console.log('📁 Serving static files from:', publicPath);
app.use(express.static(publicPath));

// FIX: Use app.use instead of app.get('*') to avoid path-to-regexp error
// For any other route that's not an API route, serve index.html
app.use((req, res, next) => {
    // Skip API routes and static files
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
        return next();
    }
    // Serve index.html for all other routes (for client-side routing)
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ========== INITIALIZE WHATSAPP CLIENT ==========
console.log('🚀 Starting WhatsApp client...');
whatsappClient.initialize().catch(error => {
    console.error('Failed to initialize WhatsApp client:', error);
});

// ========== SOCKET.IO CONNECTION HANDLING ==========
io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);
    
    socket.emit('ready', { message: 'Connected to WhatsApp server!' });
    
    if (whatsappClient.isReady()) {
        socket.emit('client_ready', { message: 'WhatsApp client is already ready!' });
    }
    
    socket.on('get_chats', async () => {
        if (whatsappClient.isReady()) {
            const chats = await whatsappClient.getChats();
            const simplifiedChats = chats.map(chat => ({
                id: chat.id._serialized,
                name: chat.name,
                isGroup: chat.isGroup,
                unreadCount: chat.unreadCount
            }));
            socket.emit('chats_list', simplifiedChats);
        } else {
            socket.emit('error', { message: 'WhatsApp client not ready' });
        }
    });
    
    socket.on('get_chat_history', async (data) => {
        const { chatId, limit = 50 } = data;
        if (whatsappClient.isReady()) {
            try {
                console.log(`📜 Socket request: Fetching history for ${chatId}`);
                const history = await whatsappClient.getChatHistory(chatId, limit);
                socket.emit('chat_history', {
                    chatId,
                    count: history.length,
                    messages: history
                });
            } catch (error: any) {
                socket.emit('error', { message: `Failed to fetch chat history: ${error.message}` });
            }
        } else {
            socket.emit('error', { message: 'WhatsApp client not ready' });
        }
    });
    
    socket.on('search_messages', async (data) => {
        const { query, limit = 50 } = data;
        if (whatsappClient.isReady() && query) {
            try {
                const results = await whatsappClient.searchMessages(query, limit);
                socket.emit('search_results', {
                    query,
                    count: results.length,
                    results
                });
            } catch (error: any) {
                socket.emit('error', { message: `Failed to search messages: ${error.message}` });
            }
        } else {
            socket.emit('error', { message: 'Missing query or client not ready' });
        }
    });
    
    socket.on('get_all_chats_with_messages', async (data) => {
        const { limit = 10 } = data;
        if (whatsappClient.isReady()) {
            try {
                const chatsWithMessages = await whatsappClient.getAllChatsWithMessages(limit);
                const formatted = Array.from(chatsWithMessages.entries()).map(([chatId, messages]) => ({
                    chatId,
                    messageCount: messages.length,
                    messages: messages.slice(0, 10)
                }));
                socket.emit('all_chats_with_messages', {
                    count: formatted.length,
                    chats: formatted
                });
            } catch (error: any) {
                socket.emit('error', { message: `Failed to fetch chats: ${error.message}` });
            }
        } else {
            socket.emit('error', { message: 'WhatsApp client not ready' });
        }
    });
    
    socket.on('send_message', async (data) => {
        const { to, message } = data;
        if (whatsappClient.isReady()) {
            try {
                await whatsappClient.sendMessage(to, message);
                socket.emit('message_sent', { success: true, to, message });
            } catch (error) {
                socket.emit('error', { message: 'Failed to send message' });
            }
        }
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
    console.log(`\n🚀 Server running on:`);
    console.log(`   - http://localhost:${PORT}`);
    console.log(`   - http://localhost:${PORT}/api/test (test endpoint)`);
    console.log(`   - http://localhost:${PORT}/api/status (status endpoint)`);
    console.log(`   - http://localhost:${PORT}/api/chats (chats endpoint)`);
    console.log(`\n📱 Available API endpoints:`);
    console.log(`   GET  /api/test - Test endpoint`);
    console.log(`   GET  /api/status - WhatsApp status`);
    console.log(`   GET  /api/chats - List all chats`);
    console.log(`   GET  /api/history/:chatId - Get chat history`);
    console.log(`   GET  /api/search?q=query - Search messages`);
    console.log(`   GET  /api/chats-with-messages - Get all chats with messages`);
    console.log(`   GET  /api/conversation/:number - Get conversation with contact`);
    console.log(`   POST /api/send-message - Send a message`);
    console.log(`\n`);
});