import React, { useEffect, useState, useRef } from 'react';
import './App.global.css';
import { API_BASE_URL, HISTORY_CONTEXT, DEFAULT_MAX_DRAFT_PARTS } from '../constants';
import { Message, Chat, AIDraft, MediaItem } from './types';
import { updateFavicon } from './utils/favicon';
import { useSocket } from './hooks/useSocket';
import { Header } from './components/Header';
import { QrCode } from './components/QrCode';
import { ErrorBar } from './components/ErrorBar';
import { Lightbox } from './components/Lightbox';
import { ChatArea } from './components/ChatArea/ChatArea';
import { Sidebar } from './components/Sidebar/Sidebar';

// ── Draft action helper ───────────────────────────────────────────────────────
async function recordDraftAction(payload: {
    promptLogId?: string;
    chatId: string;
    action: 'sent' | 'edited' | 'discarded' | 'partial';
    sentParts: string[];
    originalParts: string[];
    partActions?: Array<{
        partIndex: number;
        originalText: string;
        finalText: string | null;
        action: 'sent' | 'edited' | 'discarded';
    }>;
}): Promise<void> {
    try {
        await fetch(`${API_BASE_URL}/api/draft-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        // Não bloqueia o fluxo principal — logging apenas
        console.warn('[draft-action] Failed to record:', err);
    }
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

    // Max draft parts
    const [maxDraftParts, setMaxDraftParts] = useState(DEFAULT_MAX_DRAFT_PARTS);

    // File upload
    const [sendingMedia, setSendingMedia] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const selectedChatRef = useRef<Chat | null>(null);
    const messagesEndRef  = useRef<HTMLDivElement>(null);

    useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    useEffect(() => { updateFavicon(Object.keys(drafts).length); }, [drafts]);

    // Sync maxDraftParts to the server
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maxDraftParts }),
        }).catch(() => {/* non-critical */});
    }, [maxDraftParts]);

    // ── Data ──────────────────────────────────────────────────────────────────

    const loadChats = async () => {
        try {
            setStatus('Loading chats...');
            const res = await fetch(`${API_BASE_URL}/api/chats`);
            if (res.status === 503) {
                // WhatsApp not ready yet — will retry when 'client_ready' fires
                setStatus('Waiting for WhatsApp…');
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setChats(await res.json());
            setStatus('WhatsApp ready');
        } catch (err: any) { setError(err.message); setStatus('Error loading chats'); }
    };

    const socketRef = useSocket({
        setStatus, setError, setQrCode, setChats, setMessages,
        setDrafts, setMedia, setTranscriptions,
        setGeneratingDraft, setMultiGenerating,
        selectedChatRef, loadChats,
    });

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
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
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
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Draft actions ─────────────────────────────────────────────────────────

    const discardDraft = (chatId?: string) => {
        const id = chatId ?? selectedChat?.id;
        if (!id) return;
        const d = drafts[id];
        if (d) {
            recordDraftAction({
                promptLogId:   d.promptLogId,
                chatId:        id,
                action:        'discarded',
                sentParts:     [],
                originalParts: d.originalParts,
            });
        }
        setDrafts(prev => { const next = { ...prev }; delete next[id]; return next; });
    };

    const removePart = (chatId: string, idx: number) => {
        setDrafts(prev => {
            const d = prev[chatId];
            if (!d) return prev;

            // Registra o descarte desta parte individual
            recordDraftAction({
                promptLogId:   d.promptLogId,
                chatId,
                action:        'partial',
                sentParts:     d.parts.filter((_, i) => i !== idx),
                originalParts: d.originalParts,
                partActions: [{
                    partIndex:    idx,
                    originalText: d.originalParts[idx] ?? d.parts[idx],
                    finalText:    null,
                    action:       'discarded',
                }],
            });

            const parts = d.parts.filter((_, i) => i !== idx);
            if (parts.length === 0) {
                const next = { ...prev };
                delete next[chatId];
                return next;
            }
            return { ...prev, [chatId]: { ...d, parts } };
        });
    };

    const updatePart = (chatId: string, idx: number, value: string) => {
        setDrafts(prev => {
            const d = prev[chatId];
            if (!d) return prev;
            const parts = d.parts.map((p, i) => i === idx ? value : p);
            return { ...prev, [chatId]: { ...d, parts } };
        });
    };

    const mergeParts = (chatId: string) => {
        setDrafts(prev => {
            const d = prev[chatId];
            if (!d) return prev;
            return { ...prev, [chatId]: { ...d, parts: [d.parts.join(' ')] } };
        });
    };

    /** Carrega o draft no input para edição manual e registra como 'discarded' no banco
     *  (o usuário vai enviar via input, não via draft) */
    const editDraft = () => {
        if (!selectedChat) return;
        const d = drafts[selectedChat.id];
        if (!d) return;
        setMessageInput(d.parts.join(' '));

        recordDraftAction({
            promptLogId:   d.promptLogId,
            chatId:        selectedChat.id,
            action:        'discarded',
            sentParts:     [],
            originalParts: d.originalParts,
        });

        setDrafts(prev => { const next = { ...prev }; delete next[selectedChat.id]; return next; });
    };

    /** Envia todas as partes e registra a ação no banco. */
    const sendAllParts = async () => {
        if (!selectedChat) return;
        const d = drafts[selectedChat.id];
        if (!d) return;

        // Detecta se houve edição comparando com os originais
        const wasEdited = d.parts.some((p, i) => p !== (d.originalParts[i] ?? p));
        const action = wasEdited ? 'edited' : 'sent';

        const partActions = d.parts.map((p, i) => ({
            partIndex:    i,
            originalText: d.originalParts[i] ?? p,
            finalText:    p,
            action:       (p !== (d.originalParts[i] ?? p) ? 'edited' : 'sent') as 'sent' | 'edited',
        }));

        recordDraftAction({
            promptLogId:   d.promptLogId,
            chatId:        selectedChat.id,
            action,
            sentParts:     d.parts,
            originalParts: d.originalParts,
            partActions,
        });

        // Remove o draft antes de enviar para evitar double-click
        setDrafts(prev => { const next = { ...prev }; delete next[selectedChat.id]; return next; });

        for (const part of d.parts) {
            await sendMessage(part);
        }
    };

    /** Envia apenas uma parte específica. */
    const sendPart = async (chatId: string, idx: number) => {
        const d = drafts[chatId];
        if (!d || !selectedChat) return;

        const originalText = d.originalParts[idx] ?? d.parts[idx];
        const finalText    = d.parts[idx];
        const wasEdited    = finalText !== originalText;

        // Registra a ação desta parte
        recordDraftAction({
            promptLogId:   d.promptLogId,
            chatId,
            action:        'partial',
            sentParts:     [finalText],
            originalParts: d.originalParts,
            partActions: [{
                partIndex:    idx,
                originalText,
                finalText,
                action: wasEdited ? 'edited' : 'sent',
            }],
        });

        // Remove a parte do draft
        setDrafts(prev => {
            const current = prev[chatId];
            if (!current) return prev;
            const parts = current.parts.filter((_, i) => i !== idx);
            if (parts.length === 0) {
                const next = { ...prev };
                delete next[chatId];
                return next;
            }
            return { ...prev, [chatId]: { ...current, parts } };
        });

        await sendMessage(finalText);
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

    const currentDraft = selectedChat ? drafts[selectedChat.id] : null;

    return (
        <div className="app">
            <Header status={status} loggingOut={loggingOut} onLogout={handleLogout} />
            <QrCode qrCode={qrCode} />
            <ErrorBar error={error} />

            <div className="layout">
                <Sidebar
                    chats={chats}
                    selectedChat={selectedChat}
                    drafts={drafts}
                    messageLimit={messageLimit}
                    setMessageLimit={setMessageLimit}
                    maxDraftParts={maxDraftParts}
                    setMaxDraftParts={setMaxDraftParts}
                    multiSelectMode={multiSelectMode}
                    toggleMultiSelect={toggleMultiSelect}
                    selectedChatIds={selectedChatIds}
                    setSelectedChatIds={setSelectedChatIds}
                    multiGenerating={multiGenerating}
                    onGenerateSelected={generateDraftsForSelected}
                    onSelectChat={handleSelectChat}
                />

                <ChatArea
                    selectedChat={selectedChat}
                    multiSelectMode={multiSelectMode}
                    loadingHistory={loadingHistory}
                    messages={messages}
                    media={media}
                    transcriptions={transcriptions}
                    currentDraft={currentDraft}
                    messageInput={messageInput}
                    setMessageInput={setMessageInput}
                    sendingMedia={sendingMedia}
                    generatingDraft={generatingDraft}
                    maxDraftParts={maxDraftParts}
                    fileInputRef={fileInputRef}
                    messagesEndRef={messagesEndRef}
                    onOpenLightbox={lb => setLightbox(lb)}
                    onSend={() => sendMessage()}
                    onFileUpload={handleFileUpload}
                    onGenerate={generateDraftForCurrentChat}
                    onDiscardDraft={() => discardDraft()}
                    onRemovePart={removePart}
                    onUpdatePart={updatePart}
                    onMergeParts={mergeParts}
                    onEditDraft={editDraft}
                    onSendAllParts={sendAllParts}
                    onSendPart={sendPart}
                />
            </div>
            <Lightbox lightbox={lightbox} onClose={() => setLightbox(null)} />
        </div>
    );
}

export default App;