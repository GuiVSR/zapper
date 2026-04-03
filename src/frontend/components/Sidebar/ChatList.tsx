import React from 'react';
import { Chat, AIDraft } from '../../types';

interface ChatListProps {
    chats: Chat[];
    selectedChat: Chat | null;
    multiSelectMode: boolean;
    selectedChatIds: Set<string>;
    drafts: Record<string, AIDraft>;
    onSelectChat: (chat: Chat) => void;
}

export function ChatList({
    chats, selectedChat, multiSelectMode, selectedChatIds, drafts, onSelectChat,
}: ChatListProps) {
    return (
        <div className="chat-list">
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
    );
}
