import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Simple route to test if server is working
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is working!' });
});

// Serve static files - point to your frontend build
const publicPath = path.join(__dirname, '../public');
console.log('Serving static files from:', publicPath);

app.use(express.static(publicPath));

// For any other route, serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);
    
    // Send welcome message
    socket.emit('ready', { message: 'Connected to WhatsApp server!' });
    
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`\n🚀 Server running on:`);
    console.log(`   - http://localhost:${PORT}`);
    console.log(`   - http://localhost:${PORT}/api/test (test endpoint)`);
    console.log(`\n📱 Make sure React app is running on http://localhost:3000\n`);
});