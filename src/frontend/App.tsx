import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import { API_BASE_URL, FAVICON_SIZE, FAVICON_COLOR, HISTORY_CONTEXT, DEFAULT_MAX_DRAFT_PARTS } from '../constants';

interface Message {
    id: string;
    serializedId?: string;
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
    /** One element per message part — length 1 when no splitting. */
    parts: string[];
    basedOnMessages: Message[];
    generatedAt: number;
}

interface MediaItem {
    messageId: string;
    from: string;
    mimetype: string;
    data: string; // base64
    filename?: string | null;
    isSticker?: boolean;
    isAnimated?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACCEPTED_FILE_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
].join(',');

function getFileIcon(mimetype: string): string {
    if (mimetype === 'application/pdf') return '📕';
    if (mimetype.includes('word') || mimetype === 'application/msword') return '📘';
    if (mimetype.includes('spreadsheet') || mimetype.includes('ms-excel')) return '📗';
    if (mimetype.includes('presentation')) return '📙';
    if (mimetype.startsWith('image/')) return '🖼️';
    return '📄';
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    const [loggingOut, setLoggingOut]         = useState(false);
    const [drafts, setDrafts]               = useState<Record<string, AIDraft>>({});
    const [media, setMedia]                 = useState<Record<string, MediaItem>>({});
    const [lightbox, setLightbox]           = useState<{ mimetype: string; data: string } | null>(null);
    const [transcriptions, setTranscriptions] = useState<Record<string, string>>({});

    // Multi-select
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
    const [multiGenerating, setMultiGenerating] = useState(false);

    // Per-chat on-demand generation
    const [generatingDraft, setGeneratingDraft] = useState(false);

    // Shared message limit
    const [messageLimit, setMessageLimit] = useState(HISTORY_CONTEXT);

    // Max draft parts — controls how many parts the AI should split into
    const [maxDraftParts, setMaxDraftParts] = useState(DEFAULT_MAX_DRAFT_PARTS);

    // File upload
    const [sendingMedia, setSendingMedia] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const socketRef       = useRef<any>(null);
    const selectedChatRef = useRef<Chat | null>(null);
    const messagesEndRef  = useRef<HTMLDivElement>(null);

    useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    useEffect(() => { updateFavicon(Object.keys(drafts).length); }, [drafts]);

    // Sync maxDraftParts to the server whenever it changes so the auto-pool uses the same value
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maxDraftParts }),
        }).catch(() => {/* non-critical */});
    }, [maxDraftParts]);

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

        socket.on('media', (item: MediaItem) => {
            setMedia(prev => ({ ...prev, [item.messageId]: item }));
        });

        socket.on('transcription', (data: { messageId: string; transcript: string }) => {
            setTranscriptions(prev => ({ ...prev, [data.messageId]: data.transcript }));
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

    const MEDIA_FETCH_TYPES = new Set(['image', 'audio', 'ptt', 'video', 'sticker', 'document']);

    const fetchMediaForMessages = (msgs: Message[]) => {
        msgs
            .filter(m => m.hasMedia && MEDIA_FETCH_TYPES.has(m.type) && m.serializedId)
            .forEach(async msg => {
                try {
                    const res = await fetch(
                        `${API_BASE_URL}/api/media?id=${encodeURIComponent(msg.serializedId!)}`
                    );
                    if (!res.ok) return;
                    const item = await res.json();
                    setMedia(prev => ({
                        ...prev,
                        [msg.id]: {
                            messageId: msg.id,
                            from: msg.from,
                            mimetype: item.mimetype,
                            data: item.data,
                            filename: item.filename || null,
                            isSticker: msg.type === 'sticker',
                        },
                    }));
                } catch { /* non-critical */ }
            });
    };

    const loadChatHistory = async (chatId: string) => {
        setLoadingHistory(true); setError('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/history/${encodeURIComponent(chatId)}?limit=50`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const msgs: Message[] = data.messages;
            setMessages(msgs);
            fetchMediaForMessages(msgs);
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
            // Mirror the server-side sendSeen — clear the unread badge immediately
            setChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, unreadCount: 0 } : c));
            setMessageInput('');
        } catch (err: any) { setError(err.message); }
    };

    // ── File upload ───────────────────────────────────────────────────────────

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedChat || sendingMedia) return;

        setSendingMedia(true);
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result as string;
                    // strip data:...;base64, prefix
                    resolve(result.split(',')[1]);
                };
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            });

            const res = await fetch(`${API_BASE_URL}/api/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: selectedChat.id,
                    data: base64,
                    mimetype: file.type,
                    filename: file.name,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            // Add optimistic message to chat
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                from: 'me',
                to: selectedChat.id,
                body: `📎 ${file.name}`,
                timestamp: Math.floor(Date.now() / 1000),
                type: 'document',
                fromMe: true,
            }]);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSendingMedia(false);
            // Reset input so re-uploading the same file triggers onChange
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Document download ─────────────────────────────────────────────────────

    const downloadDocument = (item: MediaItem) => {
        const link = document.createElement('a');
        link.href = `data:${item.mimetype};base64,${item.data}`;
        link.download = item.filename || 'document';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ── Draft actions ─────────────────────────────────────────────────────────

    const discardDraft = (chatId?: string) => {
        const id = chatId ?? selectedChat?.id;
        if (!id) return;
        setDrafts(prev => { const next = { ...prev }; delete next[id]; return next; });
    };

    /** Remove a single part from the draft. */
    const removePart = (chatId: string, idx: number) => {
        setDrafts(prev => {
            const d = prev[chatId];
            if (!d) return prev;
            const parts = d.parts.filter((_, i) => i !== idx);
            if (parts.length === 0) {
                const next = { ...prev };
                delete next[chatId];
                return next;
            }
            return { ...prev, [chatId]: { ...d, parts } };
        });
    };

    /** Edit a single part inline. */
    const updatePart = (chatId: string, idx: number, value: string) => {
        setDrafts(prev => {
            const d = prev[chatId];
            if (!d) return prev;
            const parts = d.parts.map((p, i) => i === idx ? value : p);
            return { ...prev, [chatId]: { ...d, parts } };
        });
    };

    /** Merge all parts into one, joined by a space. */
    const mergeParts = (chatId: string) => {
        setDrafts(prev => {
            const d = prev[chatId];
            if (!d) return prev;
            return { ...prev, [chatId]: { ...d, parts: [d.parts.join(' ')] } };
        });
    };

    /** Load the merged text into the input box for manual editing. */
    const editDraft = () => {
        if (!selectedChat) return;
        const d = drafts[selectedChat.id];
        if (!d) return;
        setMessageInput(d.parts.join(' '));
        discardDraft();
    };

    /** Send all parts as separate WhatsApp messages in sequence. */
    const sendAllParts = async () => {
        if (!selectedChat) return;
        const d = drafts[selectedChat.id];
        if (!d) return;
        discardDraft();
        for (const part of d.parts) {
            await sendMessage(part);
        }
    };

    /** Send only one specific part. */
    const sendPart = async (chatId: string, idx: number) => {
        const d = drafts[chatId];
        if (!d || !selectedChat) return;
        const part = d.parts[idx];
        removePart(chatId, idx);
        await sendMessage(part);
    };

    // ── On-demand generation ──────────────────────────────────────────────────

    const generateDraftForCurrentChat = async () => {
        if (!selectedChat || generatingDraft) return;
        setGeneratingDraft(true);
        try {
            await fetch(`${API_BASE_URL}/api/generate-drafts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatIds: [selectedChat.id], limit: messageLimit, maxDraftParts: 1 }),
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
                body: JSON.stringify({ chatIds: Array.from(selectedChatIds), limit: messageLimit, maxDraftParts }),
            });
            setTimeout(() => setMultiGenerating(false), 30_000);
        } catch (err: any) { setError(err.message); setMultiGenerating(false); }
        setMultiSelectMode(false);
        setSelectedChatIds(new Set());
    };

    const handleLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            await fetch(`${API_BASE_URL}/api/logout`, { method: 'POST' });
            setChats([]);
            setMessages([]);
            setSelectedChat(null);
            setDrafts({});
            setStatus('Logging out…');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoggingOut(false);
        }
    };

    const formatTimestamp = (ts: number) =>
        new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const currentDraft = selectedChat ? drafts[selectedChat.id] : null;
    const isMultiPart  = (currentDraft?.parts.length ?? 0) > 1;

    // ── Media rendering helpers ───────────────────────────────────────────────

    const renderMediaContent = (msg: Message) => {
        const item = media[msg.id];

        if (!item) {
            // Still loading
            if (!msg.hasMedia) return null;
            const placeholders: Record<string, string> = {
                image:    '🖼️ Loading image…',
                video:    '🎥 Loading video…',
                audio:    '🎵 Loading audio…',
                ptt:      '🎵 Loading audio…',
                sticker:  '🎨 Loading sticker…',
                document: '📄 Loading document…',
            };
            return <div className="media-placeholder">{placeholders[msg.type] || '📎 Media'}</div>;
        }

        // Sticker
        if (item.isSticker || msg.type === 'sticker') {
            return (
                <img
                    className="bubble-sticker"
                    src={`data:${item.mimetype};base64,${item.data}`}
                    alt="sticker"
                />
            );
        }

        // Image
        if (item.mimetype.startsWith('image/')) {
            return (
                <img
                    className="bubble-image"
                    src={`data:${item.mimetype};base64,${item.data}`}
                    alt="received image"
                    onClick={() => setLightbox({ mimetype: item.mimetype, data: item.data })}
                />
            );
        }

        // Video
        if (item.mimetype.startsWith('video/')) {
            return (
                <div
                    className="bubble-video-container"
                    onClick={() => setLightbox({ mimetype: item.mimetype, data: item.data })}
                >
                    <video
                        className="bubble-video"
                        src={`data:${item.mimetype};base64,${item.data}`}
                        muted
                        preload="metadata"
                    />
                    <div className="video-play-overlay">▶</div>
                </div>
            );
        }

        // Audio
        if (item.mimetype.startsWith('audio/')) {
            return (
                <audio
                    className="bubble-audio"
                    controls
                    src={`data:${item.mimetype};base64,${item.data}`}
                />
            );
        }

        // Document
        if (msg.type === 'document' || item.filename) {
            const sizeBytes = Math.round(item.data.length * 0.75); // approximate decoded size
            return (
                <div className="bubble-document" onClick={() => downloadDocument(item)}>
                    <span className="doc-icon">{getFileIcon(item.mimetype)}</span>
                    <div className="doc-info">
                        <span className="doc-name">{item.filename || 'Document'}</span>
                        <span className="doc-size">{formatFileSize(sizeBytes)}</span>
                    </div>
                    <span className="doc-download">⬇</span>
                </div>
            );
        }

        return null;
    };

    return (
        <div className="app">
            <header className="header">
                <h1>Zapper</h1>
                <span className="status-pill">{status}</span>
                <button
                    className="btn-logout"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    title="Logout from WhatsApp"
                >
                    {loggingOut ? '⏳' : '⏏ Logout'}
                </button>
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
                            <label htmlFor="msg-limit">Msgs</label>
                            <input
                                id="msg-limit"
                                type="number"
                                min={1}
                                max={100}
                                value={messageLimit}
                                onChange={e => setMessageLimit(Math.max(1, parseInt(e.target.value) || 1))}
                                title="Number of recent messages sent to the AI as context"
                            />
                        </div>
                        <div className="limit-control">
                            <label htmlFor="parts-limit">Parts</label>
                            <input
                                id="parts-limit"
                                type="number"
                                min={1}
                                max={10}
                                value={maxDraftParts}
                                onChange={e => setMaxDraftParts(Math.max(1, parseInt(e.target.value) || 1))}
                                title="Max number of message parts the AI should split its reply into"
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
                                        {drafts[chat.id]
                                            ? `🤖 ${drafts[chat.id].parts.length} part draft ready`
                                            : 'Click to open'}
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
                                        {renderMediaContent(msg)}
                                        {transcriptions[msg.id] && (
                                            <div className="transcription">
                                                {transcriptions[msg.id]}
                                            </div>
                                        )}
                                        {msg.body && msg.type !== 'sticker' && <div>{msg.body}</div>}
                                        <span className="time">{formatTimestamp(msg.timestamp)}</span>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* ── AI DRAFT BANNER ── */}
                            {currentDraft && (
                                <div className="draft-banner">
                                    <div className="draft-header">
                                        <span className="draft-label">
                                            🤖 AI Draft
                                            {isMultiPart && (
                                                <span className="draft-parts-badge">
                                                    {currentDraft.parts.length} parts
                                                </span>
                                            )}
                                        </span>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <span className="draft-time">{formatTimestamp(currentDraft.generatedAt)}</span>
                                            <button className="btn-discard" onClick={() => discardDraft()}>✕ Discard all</button>
                                        </div>
                                    </div>

                                    {/* Individual parts */}
                                    <div className="draft-parts">
                                        {currentDraft.parts.map((part, idx) => (
                                            <div key={idx} className="draft-part">
                                                <div className="draft-part-header">
                                                    {isMultiPart && (
                                                        <span className="draft-part-num">Part {idx + 1}</span>
                                                    )}
                                                    <button
                                                        className="btn-part-remove"
                                                        onClick={() => removePart(currentDraft.chatId, idx)}
                                                        title="Remove this part"
                                                    >✕</button>
                                                </div>
                                                <textarea
                                                    className="draft-body draft-body-editable"
                                                    value={part}
                                                    onChange={e => updatePart(currentDraft.chatId, idx, e.target.value)}
                                                    rows={Math.max(2, part.split('\n').length)}
                                                />
                                                <div className="draft-part-actions">
                                                    <button
                                                        className="btn-send btn-send-part"
                                                        onClick={() => sendPart(currentDraft.chatId, idx)}
                                                    >
                                                        ✅ Send this
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Global actions */}
                                    <div className="draft-actions">
                                        <button className="btn-send" onClick={sendAllParts}>
                                            {isMultiPart ? `✅ Send all ${currentDraft.parts.length}` : '✅ Send'}
                                        </button>
                                        {isMultiPart && (
                                            <button className="btn-edit" onClick={() => mergeParts(currentDraft.chatId)}>
                                                ⊕ Merge
                                            </button>
                                        )}
                                        <button className="btn-edit" onClick={editDraft}>✏️ Edit in input</button>
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
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={ACCEPTED_FILE_TYPES}
                                    onChange={handleFileUpload}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    className="btn-attach"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={sendingMedia}
                                    title="Send a file (PDF, DOCX, XLSX, images)"
                                >
                                    {sendingMedia ? '⏳' : '📎'}
                                </button>
                                <button
                                    className="btn-generate-single"
                                    onClick={generateDraftForCurrentChat}
                                    disabled={generatingDraft}
                                    title={`Generate AI draft (${maxDraftParts} part${maxDraftParts > 1 ? 's' : ''})`}
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
            {/* Lightbox — supports both images and videos */}
            {lightbox && (
                <div className="lightbox" onClick={() => setLightbox(null)}>
                    {lightbox.mimetype.startsWith('video/') ? (
                        <video
                            className="lightbox-video"
                            src={`data:${lightbox.mimetype};base64,${lightbox.data}`}
                            controls
                            autoPlay
                            onClick={e => e.stopPropagation()}
                        />
                    ) : (
                        <img
                            src={`data:${lightbox.mimetype};base64,${lightbox.data}`}
                            alt="full size"
                            onClick={e => e.stopPropagation()}
                        />
                    )}
                    <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
                </div>
            )}
        </div>
    );
}

export default App;