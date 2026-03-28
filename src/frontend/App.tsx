import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

interface Message {
    id: string;
    from: string;
    to?: string;
    body: string;
    timestamp: number;
    type: string;
    fromMe?: boolean;
    hasMedia?: boolean;
}

interface Chat {
    id: string;
    name: string;
    isGroup: boolean;
    unreadCount: number;
    timestamp?: number;
}

function App() {
    const [socket, setSocket] = useState<any>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [qrCode, setQrCode] = useState<string>('');
    const [status, setStatus] = useState<string>('Connecting...');
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [messageInput, setMessageInput] = useState<string>('');
    const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
    const [error, setError] = useState<string>('');

    // Reference for auto-scrolling
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    // Backend server URL (your server is on port 3000)
    const API_BASE_URL = 'http://localhost:3000';

    // Auto-scroll to bottom function
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        // Connect to Socket.IO server on port 3000
        const newSocket = io(API_BASE_URL);
        setSocket(newSocket);

        // Socket event handlers
        newSocket.on('connect', () => {
            console.log('Connected to server');
            setStatus('Connected to server');
            setError('');
        });

        newSocket.on('qr', (data: { qr: string }) => {
            setQrCode(data.qr);
            setStatus('Scan QR code with WhatsApp');
        });

        newSocket.on('ready', (data: { message: string }) => {
            setStatus(data.message);
            setQrCode('');
            // Load chats when ready
            loadChats();
        });

        newSocket.on('client_ready', (data: { message: string }) => {
            setStatus(data.message);
            loadChats();
        });

        newSocket.on('message', (message: Message) => {
            console.log('New message received:', message);
            // If this message is for the selected chat, add it to messages
            if (selectedChat && (message.from === selectedChat.id || message.to === selectedChat.id)) {
                setMessages(prev => [...prev, message]);
            }
        });

        newSocket.on('chats_list', (chatsList: Chat[]) => {
            setChats(chatsList);
        });

        newSocket.on('auth_failure', (data: { message: string }) => {
            setStatus(`Auth failed: ${data.message}`);
            setError(data.message);
        });

        newSocket.on('disconnected', (data: { reason: string }) => {
            setStatus(`Disconnected: ${data.reason}`);
            setError(`Disconnected: ${data.reason}`);
        });

        newSocket.on('error', (data: { message: string }) => {
            console.error('Socket error:', data.message);
            setStatus(`Error: ${data.message}`);
            setError(data.message);
        });

        return () => {
            newSocket.close();
        };
    }, [selectedChat]);

    // Load chats from REST API - using absolute URL
    const loadChats = async () => {
        try {
            console.log('Loading chats from API...');
            setStatus('Loading chats...');
            
            const response = await fetch(`${API_BASE_URL}/api/chats`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Chats loaded:', data);
            setChats(data);
            setStatus('WhatsApp ready');
            setError('');
        } catch (error: any) {
            console.error('Error loading chats:', error);
            setError(`Failed to load chats: ${error.message}`);
            setStatus('Error loading chats');
        }
    };

    const loadChatHistory = async (chatId: string) => {
        setLoadingHistory(true);
        setError('');
        try {
            console.log(`Loading history for chat: ${chatId}`);
            const response = await fetch(`${API_BASE_URL}/api/history/${encodeURIComponent(chatId)}?limit=50`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('History loaded:', data);
            console.log(data.messages.reverse())
            setMessages(data.messages.reverse());
        } catch (error: any) {
            console.error('Error loading chat history:', error);
            setError(`Failed to load chat history: ${error.message}`);
            setMessages([]);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleSelectChat = (chat: Chat) => {
        console.log('Selected chat:', chat);
        setSelectedChat(chat);
        loadChatHistory(chat.id);
    };

    // Send message - using absolute URL
    const sendMessage = async () => {
        if (!selectedChat || !messageInput.trim()) return;

        const message = messageInput.trim();
        console.log(`Sending message to ${selectedChat.id}: ${message}`);
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/send-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: selectedChat.id,
                    message: message
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log('Message sent:', result);
            
            const sentMessage: Message = {
                id: Date.now().toString(),
                from: 'me',
                to: selectedChat.id,
                body: message,
                timestamp: Math.floor(Date.now() / 1000),
                type: 'chat',
                fromMe: true,
                hasMedia: false
            };
            setMessages(prev => [...prev, sentMessage]);
            setMessageInput('');
        } catch (error: any) {
            console.error('Error sending message:', error);
            setError(`Failed to send message: ${error.message}`);
        }
    };

    const formatTimestamp = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleTimeString();
    };

    return (
        <div className="App">
            <header className="App-header">
                <h1>Zapper</h1>
                <div className="status">Status: {status}</div>
                {error && <div className="error-message">⚠️ {error}</div>}
            </header>

            {qrCode && (
                <div className="qr-container">
                    <h3>Scan this QR code with WhatsApp</h3>
                    <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`} 
                        alt="QR Code"
                    />
                    <p>Or scan the QR code displayed in the terminal</p>
                </div>
            )}

            <div className="container">
                <div className="sidebar">
                    <h3>Chats</h3>
                    <button onClick={loadChats} className="refresh-btn">
                        Refresh Chats
                    </button>
                    <div className="chats-list">
                        {chats.length === 0 && !qrCode && (
                            <div className="no-chats">
                                {status === 'Loading chats...' ? 'Loading...' : 'No chats found. Make sure WhatsApp is connected.'}
                            </div>
                        )}
                        {chats.map(chat => (
                            <div 
                                key={chat.id} 
                                className={`chat-item ${selectedChat?.id === chat.id ? 'selected' : ''}`}
                                onClick={() => handleSelectChat(chat)}
                            >
                                <div className="chat-name">
                                    <strong>{chat.name || chat.id}</strong>
                                    {chat.isGroup && <span className="group-badge">👥</span>}
                                </div>
                                {chat.unreadCount > 0 && (
                                    <span className="unread">{chat.unreadCount}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="main-content">
                    {selectedChat ? (
                        <>
                            <div className="chat-header">
                                <h3>{selectedChat.name || selectedChat.id}</h3>
                                {loadingHistory && <div className="loading">Loading messages...</div>}
                            </div>
                            
                            <div className="messages-section" ref={messagesContainerRef}>
                                <div className="messages-list">
                                    {messages.length === 0 && !loadingHistory && (
                                        <div className="no-messages">No messages yet. Start a conversation!</div>
                                    )}
                                    {messages.map((msg, idx) => (
                                        <div key={msg.id || idx} className={`message ${msg.fromMe ? 'sent' : 'received'}`}>
                                            <div className="message-header">
                                                <strong>{msg.fromMe ? 'You' : (msg.from || 'Unknown')}</strong>
                                                <span className="timestamp">{formatTimestamp(msg.timestamp)}</span>
                                            </div>
                                            <div className="message-body">
                                                {msg.type === 'chat' ? msg.body : `[${msg.type} message] ${msg.body || ''}`}
                                                {msg.hasMedia && <span className="media-badge">📎</span>}
                                            </div>
                                        </div>
                                    ))}
                                    {/* Empty div for auto-scrolling reference */}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>

                            <div className="message-input-area">
                                <input
                                    type="text"
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    placeholder="Type a message..."
                                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                />
                                <button onClick={sendMessage}>Send</button>
                            </div>
                        </>
                    ) : (
                        <div className="no-chat-selected">
                            <p>Select a chat to start messaging</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;