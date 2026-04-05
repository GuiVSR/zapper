import { useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL } from '../../constants';
import { Message, Chat, AIDraft, MediaItem } from '../types';

interface UseSocketConfig {
    setStatus: (s: string) => void;
    setError: (s: string) => void;
    setQrCode: (s: string) => void;
    setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    setDrafts: React.Dispatch<React.SetStateAction<Record<string, AIDraft>>>;
    setMedia: React.Dispatch<React.SetStateAction<Record<string, MediaItem>>>;
    setTranscriptions: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    setGeneratingDraft: (v: boolean) => void;
    setMultiGenerating: (v: boolean) => void;
    selectedChatRef: React.RefObject<Chat | null>;
    loadChats: () => void;
}

/**
 * Manages the socket.io connection. Uses a ref to keep a single socket
 * alive across React Strict Mode's mount → unmount → remount cycle in dev,
 * so we never lose QR / ready events between the two mounts.
 */
export function useSocket(config: UseSocketConfig) {
    const socketRef = useRef<any>(null);
    const configRef = useRef(config);
    configRef.current = config;

    useEffect(() => {
        // If we already have a live socket (Strict Mode remount), reuse it.
        if (socketRef.current?.connected) return;

        const socket = io(API_BASE_URL, { transports: ['websocket'] });
        socketRef.current = socket;

        socket.on('connect',    () => { configRef.current.setStatus('Connected to server'); configRef.current.setError(''); });
        socket.on('disconnect', (reason: string) => configRef.current.setStatus(`Disconnected: ${reason}`));
        socket.on('qr', (data: { qr: string }) => { configRef.current.setQrCode(data.qr); configRef.current.setStatus('Scan QR code with WhatsApp'); });
        // Both 'ready' (WhatsApp authenticated) and the initial connect greeting share
        // the same event name. Load chats on both — loadChats handles 503 gracefully.
        socket.on('ready',        (data: { message: string }) => { configRef.current.setStatus(data.message); configRef.current.setQrCode(''); configRef.current.loadChats(); });
        socket.on('client_ready', (data: { message: string }) => { configRef.current.setStatus(data.message); configRef.current.loadChats(); });
        socket.on('message', (message: Message) => {
            const cur = configRef.current.selectedChatRef.current;
            if (cur && (message.from === cur.id || message.to === cur.id)) {
                configRef.current.setMessages(prev => [...prev, message]);
            }
            if (!message.fromMe) {
                configRef.current.setChats(prev => {
                    const idx = prev.findIndex(c => c.id === message.from);
                    if (idx === -1) return prev;
                    const updated = { ...prev[idx] };
                    if (cur?.id !== message.from) updated.unreadCount = (updated.unreadCount ?? 0) + 1;
                    return [updated, ...prev.filter((_, i) => i !== idx)];
                });
            }
        });
        socket.on('chats_list',   (list: Chat[]) => configRef.current.setChats(list));
        socket.on('auth_failure', (data: { message: string }) => { configRef.current.setStatus(`Auth failed: ${data.message}`); configRef.current.setError(data.message); });
        socket.on('error',        (err: any) => configRef.current.setError(err?.message || 'Socket error'));
        socket.on('ai_draft', (draft: AIDraft & { promptLogId?: string }) => {
            configRef.current.setDrafts(prev => ({
                ...prev,
                [draft.chatId]: {
                    ...draft,
                    // Guarda uma cópia imutável das partes originais para diff posterior
                    originalParts: [...draft.parts],
                    promptLogId:   draft.promptLogId,
                },
            }));
            configRef.current.setGeneratingDraft(false);
            configRef.current.setMultiGenerating(false);
        });

        socket.on('media', (item: MediaItem) => {
            configRef.current.setMedia(prev => ({ ...prev, [item.messageId]: item }));
        });

        socket.on('transcription', (data: { messageId: string; transcript: string }) => {
            configRef.current.setTranscriptions(prev => ({ ...prev, [data.messageId]: data.transcript }));
        });

        return () => {
            // Don't disconnect — Strict Mode will remount and we want to keep the socket.
            // The socket will be cleaned up when the page unloads.
        };
    }, []);

    return socketRef;
}
