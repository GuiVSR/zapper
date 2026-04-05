import React from 'react';
import { Chat, AIDraft } from '../../types';
import { SidebarToolbar } from './SidebarToolbar';
import { ChatList } from './ChatList';
import './Sidebar.css';

interface SidebarProps {
    chats: Chat[];
    selectedChat: Chat | null;
    drafts: Record<string, AIDraft>;
    messageLimit: number;
    setMessageLimit: (v: number) => void;
    maxDraftParts: number;
    setMaxDraftParts: (v: number) => void;
    multiSelectMode: boolean;
    toggleMultiSelect: () => void;
    selectedChatIds: Set<string>;
    setSelectedChatIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    multiGenerating: boolean;
    onGenerateSelected: () => void;
    onSelectChat: (chat: Chat) => void;
    // paginação
    loadingChats: boolean;
    hasMoreChats: boolean;
    onLoadMoreChats: () => void;
}

export function Sidebar({
    chats, selectedChat, drafts,
    messageLimit, setMessageLimit,
    maxDraftParts, setMaxDraftParts,
    multiSelectMode, toggleMultiSelect,
    selectedChatIds, setSelectedChatIds,
    multiGenerating,
    onGenerateSelected, onSelectChat,
    loadingChats, hasMoreChats, onLoadMoreChats,
}: SidebarProps) {
    const unreadCount = chats.filter(c => c.unreadCount > 0).length;

    const handleSelectUnread = () => {
        const unreadIds = chats.filter(c => c.unreadCount > 0).map(c => c.id);
        setSelectedChatIds(new Set(unreadIds));
    };

    const handleSelectAll  = () => setSelectedChatIds(new Set(chats.map(c => c.id)));
    const handleSelectNone = () => setSelectedChatIds(new Set());

    return (
        <div className="sidebar">
            <SidebarToolbar
                messageLimit={messageLimit}
                setMessageLimit={setMessageLimit}
                maxDraftParts={maxDraftParts}
                setMaxDraftParts={setMaxDraftParts}
                multiSelectMode={multiSelectMode}
                toggleMultiSelect={toggleMultiSelect}
                onSelectUnread={handleSelectUnread}
                onSelectAll={handleSelectAll}
                onSelectNone={handleSelectNone}
                onGenerate={onGenerateSelected}
                chatCount={chats.length}
                unreadCount={unreadCount}
                selectedCount={selectedChatIds.size}
                multiGenerating={multiGenerating}
            />
            <ChatList
                chats={chats}
                selectedChat={selectedChat}
                multiSelectMode={multiSelectMode}
                selectedChatIds={selectedChatIds}
                drafts={drafts}
                onSelectChat={onSelectChat}
                loadingChats={loadingChats}
                hasMoreChats={hasMoreChats}
                onLoadMoreChats={onLoadMoreChats}
            />
        </div>
    );
}