import React from 'react';
import { Message, Chat, AIDraft, MediaItem } from '../../types';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { DraftBanner } from './DraftBanner';
import { InputBar } from './InputBar';
import './ChatArea.css';

interface ChatAreaProps {
    selectedChat: Chat | null;
    multiSelectMode: boolean;
    loadingHistory: boolean;
    messages: Message[];
    media: Record<string, MediaItem>;
    transcriptions: Record<string, string>;
    currentDraft: AIDraft | null;
    messageInput: string;
    setMessageInput: (v: string) => void;
    sendingMedia: boolean;
    generatingDraft: boolean;
    maxDraftParts: number;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    onOpenLightbox: (lb: { mimetype: string; data: string }) => void;
    onSend: () => void;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onGenerate: () => void;
    onDiscardDraft: () => void;
    onRemovePart: (chatId: string, idx: number) => void;
    onUpdatePart: (chatId: string, idx: number, value: string) => void;
    onMergeParts: (chatId: string) => void;
    onEditDraft: () => void;
    onSendAllParts: () => void;
    onSendPart: (chatId: string, idx: number) => void;
}

export function ChatArea({
    selectedChat, multiSelectMode, loadingHistory,
    messages, media, transcriptions, currentDraft,
    messageInput, setMessageInput, sendingMedia,
    generatingDraft, maxDraftParts,
    fileInputRef, messagesEndRef,
    onOpenLightbox, onSend, onFileUpload, onGenerate,
    onDiscardDraft, onRemovePart, onUpdatePart,
    onMergeParts, onEditDraft, onSendAllParts, onSendPart,
}: ChatAreaProps) {
    return (
        <div className="chat-area">
            {selectedChat && !multiSelectMode ? (
                <>
                    <ChatHeader chat={selectedChat} loadingHistory={loadingHistory} />

                    <div className="messages">
                        {messages.map((msg, i) => (
                            <MessageBubble
                                key={msg.id || i}
                                msg={msg}
                                media={media}
                                transcription={transcriptions[msg.id]}
                                onOpenLightbox={onOpenLightbox}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {currentDraft && (
                        <DraftBanner
                            draft={currentDraft}
                            onDiscard={onDiscardDraft}
                            onRemovePart={onRemovePart}
                            onUpdatePart={onUpdatePart}
                            onMergeParts={onMergeParts}
                            onEditDraft={onEditDraft}
                            onSendAllParts={onSendAllParts}
                            onSendPart={onSendPart}
                        />
                    )}

                    <InputBar
                        messageInput={messageInput}
                        setMessageInput={setMessageInput}
                        onSend={onSend}
                        onFileUpload={onFileUpload}
                        fileInputRef={fileInputRef}
                        sendingMedia={sendingMedia}
                        generatingDraft={generatingDraft}
                        onGenerate={onGenerate}
                        maxDraftParts={maxDraftParts}
                    />
                </>
            ) : (
                <div className="empty">
                    {multiSelectMode
                        ? 'Select chats in the sidebar, then click Generate'
                        : 'Select a chat to start messaging'}
                </div>
            )}
        </div>
    );
}
