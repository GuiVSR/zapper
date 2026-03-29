import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import { API_BASE_URL, FAVICON_SIZE, FAVICON_COLOR } from '../constants';

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

interface AIDraft {
    chatId: string;
    draft: string;
    basedOnMessages: Message[];
    generatedAt: number;
}


// ── Favicon: blue circle with pending draft count ─────────────────────────────
function updateFavicon(count: number): void {
    const canvas = document.createElement('canvas');
    canvas.width  = FAVICON_SIZE;
    canvas.height = FAVICON_SIZE;
    const ctx = canvas.getContext('2d')!;

    // Blue circle
    ctx.beginPath();
    ctx.arc(FAVICON_SIZE / 2, FAVICON_SIZE / 2, FAVICON_SIZE / 2 - 1, 0, 2 * Math.PI);
    ctx.fillStyle = FAVICON_COLOR;
    ctx.fill();

    if (count > 0) {
        // White number
        ctx.fillStyle = 'white';
        ctx.font = `bold ${count > 9 ? '14' : '18'}px sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(count > 99 ? '99+' : String(count), FAVICON_SIZE / 2, FAVICON_SIZE / 2 + 1);
    } else {
        // White Z when no drafts pending
        ctx.fillStyle = 'white';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Z', FAVICON_SIZE / 2, FAVICON_SIZE / 2 + 1);
    }

    const link = document.getElementById('favicon') as HTMLLinkElement;
    if (link) link.href = canvas.toDataURL('image/png');
}

function App() {
    const [messages, setMessages]             = useState<Message[]>([]);
    const [qrCode, setQrCode]                 = useState<string>('');
    const [status, setStatus]                 = useState<string>('Connecting...');
    const [chats, setChats]                   = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat]     = useState<Chat | null>(null);
    const [messageInput, setMessageInput]     = useState<string>('');
    const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
    const [error, setError]                   = useState<string>('');
    // Map of chatId → pending AI draft
    const [drafts, setDrafts]                 = useState<Record<string, AIDraft>>({});

    // Keep favicon in sync with pending draft count
    useEffect(() => {
        updateFavicon(Object.keys(drafts).length);
    }, [drafts]);

    const socketRef          = useRef<any>(null);
    const selectedChatRef    = useRef<Chat | null>(null);
    const messagesEndRef     = useRef<HTMLDivElement>(null);


    useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const socket = io(API_BASE_URL, { transports: ['websocket'] });
        socketRef.current = socket;

        socket.on('connect', () => {
            setStatus('Connected to server');
            setError('');
        });
        socket.on('disconnect', (reason: string) => setStatus(`Disconnected: ${reason}`));
        socket.on('qr', (data: { qr: string }) => {
            setQrCode(data.qr);
            setStatus('Scan QR code with WhatsApp');
        });
        socket.on('ready', (data: { message: string }) => {
            setStatus(data.message);
            setQrCode('');
            loadChats();
        });
        socket.on('client_ready', (data: { message: string }) => {
            setStatus(data.message);
            loadChats();
        });
        socket.on('message', (message: Message) => {
            const currentChat = selectedChatRef.current;

            // Append to open chat's message list
            if (currentChat && (message.from === currentChat.id || message.to === currentChat.id)) {
                setMessages(prev => [...prev, message]);
            }

            // Update sidebar: bump chat to top + increment unread if not currently open
            if (!message.fromMe) {
                const incomingChatId = message.from;
                setChats(prev => {
                    const idx = prev.findIndex(c => c.id === incomingChatId);
                    if (idx === -1) return prev; // unknown chat — will appear on next full load
                    const updated = { ...prev[idx] };
                    if (currentChat?.id !== incomingChatId) {
                        updated.unreadCount = (updated.unreadCount ?? 0) + 1;
                    }
                    const rest = prev.filter((_, i) => i !== idx);
                    return [updated, ...rest];
                });
            }
        });
        socket.on('chats_list', (chatsList: Chat[]) => setChats(chatsList));
        socket.on('auth_failure', (data: { message: string }) => {
            setStatus(`Auth failed: ${data.message}`);
            setError(data.message);
        });
        socket.on('error', (err: any) => setError(err?.message || 'Socket error'));

        // ── AI draft handler ──────────────────────────────────────────────────
        socket.on('ai_draft', (draft: AIDraft) => {
            console.log('🤖 AI draft received for', draft.chatId);
            setDrafts(prev => ({ ...prev, [draft.chatId]: draft }));

            // If the draft chat is not currently open, increment a visual indicator
            // (the badge on the sidebar already handles unread; here we just store it)
        });

        return () => { socket.disconnect(); };
    }, []);

    const loadChats = async () => {
        try {
            setStatus('Loading chats...');
            const response = await fetch(`${API_BASE_URL}/api/chats`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setChats(await response.json());
            setStatus('WhatsApp ready');
        } catch (err: any) {
            setError(err.message);
            setStatus('Error loading chats');
        }
    };

    const loadChatHistory = async (chatId: string) => {
        setLoadingHistory(true);
        setError('');
        try {
            const response = await fetch(
                `${API_BASE_URL}/api/history/${encodeURIComponent(chatId)}?limit=50`
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            setMessages(data.messages);
        } catch (err: any) {
            setError(err.message);
            setMessages([]);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleSelectChat = (chat: Chat) => {
        setSelectedChat(chat);
        loadChatHistory(chat.id);
        // Clear unread badge when opening a chat
        setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c));
    };

    const sendMessage = async (text?: string) => {
        if (!selectedChat) return;
        const body = (text ?? messageInput).trim();
        if (!body) return;

        try {
            await fetch(`${API_BASE_URL}/api/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: selectedChat.id, message: body }),
            });
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now().toString(),
                    from: 'me',
                    to: selectedChat.id,
                    body,
                    timestamp: Math.floor(Date.now() / 1000),
                    type: 'chat',
                    fromMe: true,
                },
            ]);
            setMessageInput('');
        } catch (err: any) {
            setError(err.message);
        }
    };

    // Loads draft into the input box for editing before sending
    const editDraft = () => {
        if (!selectedChat) return;
        const draft = drafts[selectedChat.id];
        if (!draft) return;
        setMessageInput(draft.draft);
        discardDraft();
    };

    // Sends the draft immediately with one click
    const sendDraft = async () => {
        if (!selectedChat) return;
        const draft = drafts[selectedChat.id];
        if (!draft) return;
        discardDraft();
        await sendMessage(draft.draft);
    };

    const discardDraft = () => {
        if (!selectedChat) return;
        setDrafts(prev => {
            const next = { ...prev };
            delete next[selectedChat.id];
            return next;
        });
    };

    const formatTimestamp = (ts: number) =>
        new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const currentDraft = selectedChat ? drafts[selectedChat.id] : null;

    return (
        <div className="app">
            <header className="header">
                <h1>Zapper</h1>
                <span className="status-pill">{status}</span>
            </header>

            {qrCode && (
                <div className="qr">
                    <h3>Scan QR Code</h3>
                    <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`}
                        alt="WhatsApp QR Code"
                    />
                </div>
            )}

            {error && <div className="error-bar">⚠ {error}</div>}

            <div className="layout">
                {/* SIDEBAR */}
                <div className="sidebar">
                    <div className="chat-list">
                        {chats.map(chat => (
                            <div
                                key={chat.id}
                                className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
                                onClick={() => handleSelectChat(chat)}
                            >
                                <div className="chat-meta">
                                    <div className="chat-name">{chat.name || chat.id}</div>
                                    <div className="chat-preview">
                                        {drafts[chat.id]
                                            ? '🤖 Draft ready'
                                            : 'Click to open'}
                                    </div>
                                </div>
                                <div className="chat-badges">
                                    {drafts[chat.id] && <span className="badge badge-ai">AI</span>}
                                    {chat.unreadCount > 0 && (
                                        <span className="badge">{chat.unreadCount}</span>
                                    )}
                                </div>
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
                                {loadingHistory && <span className="loading-hint"> Loading…</span>}
                            </div>

                            <div className="messages">
                                {messages.map((msg, i) => (
                                    <div
                                        key={msg.id || i}
                                        className={`bubble ${msg.fromMe ? 'sent' : 'received'}`}
                                    >
                                        <div>{msg.body}</div>
                                        <span className="time">{formatTimestamp(msg.timestamp)}</span>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* ── AI Draft banner ── */}
                            {currentDraft && (
                                <div className="draft-banner">
                                    <div className="draft-header">
                                        <span className="draft-label">🤖 AI Draft</span>
                                        <span className="draft-time">
                                            {formatTimestamp(currentDraft.generatedAt)}
                                        </span>
                                    </div>
                                    <div className="draft-body">{currentDraft.draft}</div>
                                    <div className="draft-actions">
                                        <button className="btn-send" onClick={sendDraft}>
                                            ✅ Send
                                        </button>
                                        <button className="btn-edit" onClick={editDraft}>
                                            ✏️ Edit
                                        </button>
                                        <button className="btn-discard" onClick={discardDraft}>
                                            ✕ Discard
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="input-bar">
                                <input
                                    value={messageInput}
                                    onChange={e => setMessageInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                    placeholder="Type a message"
                                />
                                <button onClick={() => sendMessage()}>Send</button>
                            </div>
                        </>
                    ) : (
                        <div className="empty">Select a chat to start messaging</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;