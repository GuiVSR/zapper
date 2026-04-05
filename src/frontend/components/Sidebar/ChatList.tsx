import React from 'react';
import { Chat, AIDraft } from '../../types';
import './Sidebar.css';

interface ChatListProps {
    chats: Chat[];
    selectedChat: Chat | null;
    multiSelectMode: boolean;
    selectedChatIds: Set<string>;
    drafts: Record<string, AIDraft>;
    onSelectChat: (chat: Chat) => void;
    // paginação
    loadingChats: boolean;
    hasMoreChats: boolean;
    onLoadMoreChats: () => void;
}

export function ChatList({
    chats, selectedChat, multiSelectMode, selectedChatIds, drafts, onSelectChat,
    loadingChats, hasMoreChats, onLoadMoreChats,
}: ChatListProps) {
    return (
        <div className="chat-list">
            {/* Indicador de carregamento inicial (lista ainda vazia) */}
            {loadingChats && chats.length === 0 && (
                <div className="chat-list-loading">
                    ⏳ Loading chats…
                </div>
            )}

            {chats.map(chat => (
                <div
                    key={chat.id}
                    className={[
                        'chat-item',
                        !multiSelectMode && selectedChat?.id === chat.id ? 'active' : '',
                        multiSelectMode && selectedChatIds.has(chat.id) ? 'multi-selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onSelectChat(chat)}
                >
                    <div className="chat-item-left">
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
                    </div>
                    <div className="chat-badges">
                        {drafts[chat.id] && <span className="badge badge-ai">AI</span>}
                        {chat.unreadCount > 0 && <span className="badge">{chat.unreadCount}</span>}
                    </div>
                </div>
            ))}

            {/* Botão "Load more" — aparece só quando há mais chats disponíveis */}
            {hasMoreChats && (
                <button
                    className="btn-load-more"
                    onClick={onLoadMoreChats}
                    disabled={loadingChats}
                >
                    {loadingChats ? '⏳ Loading…' : '↓ Load more chats'}
                </button>
            )}

            {/* Spinner inline quando está carregando mais (lista já tem itens) */}
            {loadingChats && chats.length > 0 && (
                <div className="chat-list-loading-more">
                    ⏳ Loading…
                </div>
            )}
        </div>
    );
}