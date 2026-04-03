import React from 'react';
import { Chat, AIDraft } from '../../types';
import { SidebarToolbar } from './SidebarToolbar';
import { MultiSelectBar } from './MultiSelectBar';
import { ChatList } from './ChatList';

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
    multiGenerating: boolean;
    onGenerateSelected: () => void;
    onSelectChat: (chat: Chat) => void;
}

export function Sidebar({
    chats, selectedChat, drafts,
    messageLimit, setMessageLimit,
    maxDraftParts, setMaxDraftParts,
    multiSelectMode, toggleMultiSelect,
    selectedChatIds, multiGenerating,
    onGenerateSelected, onSelectChat,
}: SidebarProps) {
    return (
        <div className="sidebar">
            <SidebarToolbar
                messageLimit={messageLimit}
                setMessageLimit={setMessageLimit}
                maxDraftParts={maxDraftParts}
                setMaxDraftParts={setMaxDraftParts}
                multiSelectMode={multiSelectMode}
                toggleMultiSelect={toggleMultiSelect}
            />
            {multiSelectMode && (
                <MultiSelectBar
                    selectedChatIds={selectedChatIds}
                    multiGenerating={multiGenerating}
                    onGenerate={onGenerateSelected}
                />
            )}
            <ChatList
                chats={chats}
                selectedChat={selectedChat}
                multiSelectMode={multiSelectMode}
                selectedChatIds={selectedChatIds}
                drafts={drafts}
                onSelectChat={onSelectChat}
            />
        </div>
    );
}
