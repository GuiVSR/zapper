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
    const [messages, setMessages] = useState<Message[]>([]);
    const [qrCode, setQrCode] = useState<string>('');
    const [status, setStatus] = useState<string>('Connecting...');
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [messageInput, setMessageInput] = useState<string>('');
    const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
    const [error, setError] = useState<string>('');

    const socketRef = useRef<any>(null);
    const selectedChatRef = useRef<Chat | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    const API_BASE_URL = 'http://127.0.0.1:3000';

    // Keep selectedChat always updated inside socket callbacks
    useEffect(() => {
        selectedChatRef.current = selectedChat;
    }, [selectedChat]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // ✅ Initialize socket ONCE
    useEffect(() => {
        console.log('Initializing socket...');

        const socket = io(API_BASE_URL, {
            transports: ['websocket'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Connected:', socket.id);
            setStatus('Connected to server');
            setError('');
        });

        socket.on('disconnect', (reason: string) => {
            console.log('❌ Disconnected:', reason);
            setStatus(`Disconnected: ${reason}`);
        });

        socket.on('qr', (data: { qr: string }) => {
            console.log('🔥 QR RECEIVED:', data.qr?.slice(0, 20));
            setQrCode(data.qr);
            setStatus('Scan QR code with WhatsApp');
        });

        socket.on('ready', (data: { message: string }) => {
            console.log('✅ READY:', data);
            setStatus(data.message);
            setQrCode('');
            loadChats();
        });

        socket.on('client_ready', (data: { message: string }) => {
            console.log('✅ CLIENT READY:', data);
            setStatus(data.message);
            loadChats();
        });

        socket.on('message', (message: Message) => {
            console.log('📩 MESSAGE:', message);

            const currentChat = selectedChatRef.current;

            if (
                currentChat &&
                (message.from === currentChat.id ||
                    message.to === currentChat.id)
            ) {
                setMessages(prev => [...prev, message]);
            }
        });

        socket.on('chats_list', (chatsList: Chat[]) => {
            console.log('📚 Chats list received');
            setChats(chatsList);
        });

        socket.on('auth_failure', (data: { message: string }) => {
            console.log('❌ Auth failure:', data);
            setStatus(`Auth failed: ${data.message}`);
            setError(data.message);
        });

        socket.on('error', (err: any) => {
            console.error('🚨 SOCKET ERROR:', err);
            setError(err?.message || 'Socket error');
        });

        return () => {
            console.log('🧹 Cleaning socket...');
            socket.disconnect();
        };
    }, []);

    const loadChats = async () => {
        try {
            console.log('Loading chats...');
            setStatus('Loading chats...');

            const response = await fetch(`${API_BASE_URL}/api/chats`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            setChats(data);
            setStatus('WhatsApp ready');
        } catch (error: any) {
            console.error(error);
            setError(error.message);
            setStatus('Error loading chats');
        }
    };

    const loadChatHistory = async (chatId: string) => {
        setLoadingHistory(true);
        setError('');

        try {
            console.log('Loading history for:', chatId);

            const response = await fetch(
                `${API_BASE_URL}/api/history/${encodeURIComponent(chatId)}?limit=50`
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            setMessages(data.messages);
        } catch (error: any) {
            console.error(error);
            setError(error.message);
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

    const sendMessage = async () => {
        if (!selectedChat || !messageInput.trim()) return;

        const message = messageInput.trim();

        try {
            await fetch(`${API_BASE_URL}/api/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: selectedChat.id,
                    message,
                }),
            });

            setMessages(prev => [
                ...prev,
                {
                    id: Date.now().toString(),
                    from: 'me',
                    to: selectedChat.id,
                    body: message,
                    timestamp: Math.floor(Date.now() / 1000),
                    type: 'chat',
                    fromMe: true,
                },
            ]);

            setMessageInput('');
        } catch (error: any) {
            console.error(error);
            setError(error.message);
        }
    };

    const formatTimestamp = (timestamp: number) =>
        new Date(timestamp * 1000).toLocaleTimeString();

    return (
        <div className="app">
            {/* HEADER */}
            <header className="header">
                <h1>Zapper</h1>
            </header>

            {/* QR */}
            {qrCode && (
                <div className="qr">
                    <h3>Scan QR Code</h3>
                    <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                            qrCode
                        )}`}
                    />
                </div>
            )}

            <div className="layout">
                {/* SIDEBAR */}
                <div className="sidebar">

                    <div className="chat-list">
                        {chats.map(chat => (
                            <div
                                key={chat.id}
                                className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''
                                    }`}
                                onClick={() => handleSelectChat(chat)}
                            >
                                <div className="chat-meta">
                                    <div className="chat-name">
                                        {chat.name || chat.id}
                                    </div>
                                    <div className="chat-preview">
                                        Click to open
                                    </div>
                                </div>

                                {chat.unreadCount > 0 && (
                                    <span className="badge">{chat.unreadCount}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* CHAT AREA */}
                <div className="chat-area">
                    {selectedChat ? (
                        <>
                            <div className="chat-header">
                                {selectedChat.name || selectedChat.id}
                            </div>

                            <div className="messages">
                                {messages.map((msg, i) => (
                                    <div
                                        key={msg.id || i}
                                        className={`bubble ${msg.fromMe ? 'sent' : 'received'
                                            }`}
                                    >
                                        <div>{msg.body}</div>
                                        <span className="time">
                                            {formatTimestamp(msg.timestamp)}
                                        </span>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="input-bar">
                                <input
                                    value={messageInput}
                                    onChange={e => setMessageInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                    placeholder="Type a message"
                                />
                                <button onClick={sendMessage}>Send</button>
                            </div>
                        </>
                    ) : (
                        <div className="empty">Select a chat</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;