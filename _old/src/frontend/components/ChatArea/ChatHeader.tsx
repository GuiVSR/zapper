import React from 'react';
import { Chat } from '../../types';
import './ChatArea.css';

interface ChatHeaderProps {
    chat: Chat;
    loadingHistory: boolean;
}

export function ChatHeader({ chat, loadingHistory }: ChatHeaderProps) {
    return (
        <div className="chat-header">
            {chat.name || chat.id}
            {loadingHistory && <span className="loading-hint"> Loading…</span>}
        </div>
    );
}
