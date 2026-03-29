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

// ── Favicon ───────────────────────────────────────────────────────────────────
function updateFavicon(count: number): void {
    const canvas = document.createElement('canvas');
    canvas.width  = FAVICON_SIZE;
    canvas.height = FAVICON_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(FAVICON_SIZE / 2, FAVICON_SIZE / 2, FAVICON_SIZE / 2 - 1, 0, 2 * Math.PI);
    ctx.fillStyle = FAVICON_COLOR;
    ctx.fill();
    ctx.fillStyle = 'white';
    if (count > 0) {
        ctx.font = `bold ${count > 9 ? '14' : '18'}px sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(count > 99 ? '99+' : String(count), FAVICON_SIZE / 2, FAVICON_SIZE / 2 + 1);
    } else {
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Z', FAVICON_SIZE / 2, FAVICON_SIZE / 2 + 1);
    }
    const link = document.getElementById('favicon') as HTMLLinkElement;
    if (link) link.href = canvas.toDataURL('image/png');
}

function App() {
    const [messages, setMessages]           = useState<Message[]>([]);
    const [qrCode, setQrCode]               = useState<string>('');
    const [status, setStatus]               = useState<string>('Connecting...');
    const [chats, setChats]                 = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat]   = useState<Chat | null>(null);
    const [messageInput, setMessageInput]   = useState<string>('');
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [error, setError]                 = useState<string>('');
    const [drafts, setDrafts]               = useState<Record<string, AIDraft>>({});

    // Multi-select
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
    const [multiGenerating, setMultiGenerating] = useState(false);

    // Per-chat on-demand generation
    const [generatingDraft, setGeneratingDraft] = useState(false);

    // Shared message limit
    const [messageLimit, setMessageLimit] = useState(10);

    const socketRef       = useRef<any>(null);
    const selectedChatRef = useRef<Chat | null>(null);
    const messagesEndRef  = useRef<HTMLDivElement>(null);

    useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    useEffect(() => { updateFavicon(Object.keys(drafts).length); }, [drafts]);

    useEffect(() => {
        const socket = io(API_BASE_URL, { transports: ['websocket'] });
        socketRef.current = socket;

        socket.on('connect',    () => { setStatus('Connected to server'); setError(''); });
        socket.on('disconnect', (reason: string) => setStatus(`Disconnected: ${reason}`));
        socket.on('qr', (data: { qr: string }) => { setQrCode(data.qr); setStatus('Scan QR code with WhatsApp'); });
        socket.on('ready',        (data: { message: string }) => { setStatus(data.message); setQrCode(''); loadChats(); });
        socket.on('client_ready', (data: { message: string }) => { setStatus(data.message); loadChats(); });
        socket.on('message', (message: Message) => {
            const cur = selectedChatRef.current;
            if (cur && (message.from === cur.id || message.to === cur.id)) {
                setMessages(prev => [...prev, message]);
            }
            if (!message.fromMe) {
                setChats(prev => {
                    const idx = prev.findIndex(c => c.id === message.from);
                    if (idx === -1) return prev;
                    const updated = { ...prev[idx] };
                    if (cur?.id !== message.from) updated.unreadCount = (updated.unreadCount ?? 0) + 1;
                    return [updated, ...prev.filter((_, i) => i !== idx)];
                });
            }
        });
        socket.on('chats_list',   (list: Chat[]) => setChats(list));
        socket.on('auth_failure', (data: { message: string }) => { setStatus(`Auth failed: ${data.message}`); setError(data.message); });
        socket.on('error',        (err: any) => setError(err?.message || 'Socket error'));
        socket.on('ai_draft', (draft: AIDraft) => {
            setDrafts(prev => ({ ...prev, [draft.chatId]: draft }));
            setGeneratingDraft(false);
            setMultiGenerating(false);
        });

        return () => { socket.disconnect(); };
    }, []);

    // ── Data ──────────────────────────────────────────────────────────────────

    const loadChats = async () => {
        try {
            setStatus('Loading chats...');
            const res = await fetch(`${API_BASE_URL}/api/chats`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setChats(await res.json());
            setStatus('WhatsApp ready');
        } catch (err: any) { setError(err.message); setStatus('Error loading chats'); }
    };

    const loadChatHistory = async (chatId: string) => {
        setLoadingHistory(true); setError('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/history/${encodeURIComponent(chatId)}?limit=50`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setMessages((await res.json()).messages);
        } catch (err: any) { setError(err.message); setMessages([]); }
        finally { setLoadingHistory(false); }
    };

    // ── Chat selection ────────────────────────────────────────────────────────

    const handleSelectChat = (chat: Chat) => {
        if (multiSelectMode) {
            setSelectedChatIds(prev => {
                const next = new Set(prev);
                next.has(chat.id) ? next.delete(chat.id) : next.add(chat.id);
                return next;
            });
            return;
        }
        setSelectedChat(chat);
        loadChatHistory(chat.id);
        setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c));
    };

    const toggleMultiSelect = () => {
        setMultiSelectMode(prev => !prev);
        setSelectedChatIds(new Set());
    };

    // ── Messaging ─────────────────────────────────────────────────────────────

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
            setMessages(prev => [...prev, {
                id: Date.now().toString(), from: 'me', to: selectedChat.id,
                body, timestamp: Math.floor(Date.now() / 1000), type: 'chat', fromMe: true,
            }]);
            setMessageInput('');
        } catch (err: any) { setError(err.message); }
    };

    // ── Draft actions ─────────────────────────────────────────────────────────

    const editDraft = () => {
        if (!selectedChat) return;
        const d = drafts[selectedChat.id];
        if (!d) return;
        setMessageInput(d.draft);
        discardDraft();
    };

    const sendDraft = async () => {
        if (!selectedChat) return;
        const d = drafts[selectedChat.id];
        if (!d) return;
        discardDraft();
        await sendMessage(d.draft);
    };

    const discardDraft = (chatId?: string) => {
        const id = chatId ?? selectedChat?.id;
        if (!id) return;
        setDrafts(prev => { const next = { ...prev }; delete next[id]; return next; });
    };

    // ── On-demand generation ──────────────────────────────────────────────────

    const generateDraftForCurrentChat = async () => {
        if (!selectedChat || generatingDraft) return;
        setGeneratingDraft(true);
        try {
            await fetch(`${API_BASE_URL}/api/generate-drafts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatIds: [selectedChat.id], limit: messageLimit }),
            });
        } catch (err: any) { setError(err.message); setGeneratingDraft(false); }
    };

    const generateDraftsForSelected = async () => {
        if (selectedChatIds.size === 0 || multiGenerating) return;
        setMultiGenerating(true);
        try {
            await fetch(`${API_BASE_URL}/api/generate-drafts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatIds: Array.from(selectedChatIds), limit: messageLimit }),
            });
            setTimeout(() => setMultiGenerating(false), 30_000);
        } catch (err: any) { setError(err.message); setMultiGenerating(false); }
        setMultiSelectMode(false);
        setSelectedChatIds(new Set());
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
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`} alt="QR" />
                </div>
            )}

            {error && <div className="error-bar">⚠ {error}</div>}

            <div className="layout">
                {/* SIDEBAR */}
                <div className="sidebar">

                    {/* Toolbar */}
                    <div className="sidebar-toolbar">
                        <div className="limit-control">
                            <label htmlFor="msg-limit">Messages</label>
                            <input
                                id="msg-limit"
                                type="number"
                                min={1}
                                max={100}
                                value={messageLimit}
                                onChange={e => setMessageLimit(Math.max(1, parseInt(e.target.value) || 1))}
                            />
                        </div>
                        <button
                            className={`btn-multiselect ${multiSelectMode ? 'active' : ''}`}
                            onClick={toggleMultiSelect}
                            title="Select multiple chats to generate drafts"
                        >
                            {multiSelectMode ? '✕ Cancel' : '☑ Select'}
                        </button>
                    </div>

                    {/* Multi-select action bar */}
                    {multiSelectMode && (
                        <div className="multi-generate-bar">
                            <span className="multi-count">
                                {selectedChatIds.size === 0
                                    ? 'Select chats below'
                                    : `${selectedChatIds.size} chat${selectedChatIds.size > 1 ? 's' : ''} selected`}
                            </span>
                            <button
                                className="btn-generate-multi"
                                disabled={selectedChatIds.size === 0 || multiGenerating}
                                onClick={generateDraftsForSelected}
                            >
                                {multiGenerating ? '⏳ Generating…' : '🤖 Generate'}
                            </button>
                        </div>
                    )}

                    <div className="chat-list">
                        {chats.map(chat => (
                            <div
                                key={chat.id}
                                className={[
                                    'chat-item',
                                    !multiSelectMode && selectedChat?.id === chat.id ? 'active' : '',
                                    multiSelectMode && selectedChatIds.has(chat.id) ? 'multi-selected' : '',
                                ].filter(Boolean).join(' ')}
                                onClick={() => handleSelectChat(chat)}
                            >
                                {multiSelectMode && (
                                    <div className={`chat-checkbox ${selectedChatIds.has(chat.id) ? 'checked' : ''}`}>
                                        {selectedChatIds.has(chat.id) && '✓'}
                                    </div>
                                )}
                                <div className="chat-meta">
                                    <div className="chat-name">{chat.name || chat.id}</div>
                                    <div className="chat-preview">
                                        {drafts[chat.id] ? '🤖 Draft ready' : 'Click to open'}
                                    </div>
                                </div>
                                <div className="chat-badges">
                                    {drafts[chat.id] && <span className="badge badge-ai">AI</span>}
                                    {chat.unreadCount > 0 && <span className="badge">{chat.unreadCount}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CHAT AREA */}
                <div className="chat-area">
                    {selectedChat && !multiSelectMode ? (
                        <>
                            <div className="chat-header">
                                {selectedChat.name || selectedChat.id}
                                {loadingHistory && <span className="loading-hint"> Loading…</span>}
                            </div>

                            <div className="messages">
                                {messages.map((msg, i) => (
                                    <div key={msg.id || i} className={`bubble ${msg.fromMe ? 'sent' : 'received'}`}>
                                        <div>{msg.body}</div>
                                        <span className="time">{formatTimestamp(msg.timestamp)}</span>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {currentDraft && (
                                <div className="draft-banner">
                                    <div className="draft-header">
                                        <span className="draft-label">🤖 AI Draft</span>
                                        <span className="draft-time">{formatTimestamp(currentDraft.generatedAt)}</span>
                                    </div>
                                    <div className="draft-body">{currentDraft.draft}</div>
                                    <div className="draft-actions">
                                        <button className="btn-send"    onClick={sendDraft}>✅ Send</button>
                                        <button className="btn-edit"    onClick={editDraft}>✏️ Edit</button>
                                        <button className="btn-discard" onClick={() => discardDraft()}>✕ Discard</button>
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
                                <button
                                    className="btn-generate-single"
                                    onClick={generateDraftForCurrentChat}
                                    disabled={generatingDraft}
                                    title={`Generate AI draft from last ${messageLimit} messages`}
                                >
                                    {generatingDraft ? '⏳' : '🤖'}
                                </button>
                                <button onClick={() => sendMessage()}>Send</button>
                            </div>
                        </>
                    ) : (
                        <div className="empty">
                            {multiSelectMode
                                ? 'Select chats in the sidebar, then click Generate'
                                : 'Select a chat to start messaging'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;