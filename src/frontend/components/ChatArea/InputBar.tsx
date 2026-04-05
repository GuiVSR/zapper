import React from 'react';
import { ACCEPTED_FILE_TYPES } from '../../utils/fileHelpers';
import './ChatArea.css';

interface InputBarProps {
    messageInput: string;
    setMessageInput: (v: string) => void;
    onSend: () => void;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    sendingMedia: boolean;
    generatingDraft: boolean;
    onGenerate: () => void;
    maxDraftParts: number;
}

export function InputBar({
    messageInput, setMessageInput, onSend, onFileUpload,
    fileInputRef, sendingMedia, generatingDraft, onGenerate, maxDraftParts,
}: InputBarProps) {
    return (
        <div className="input-bar">
            <input
                value={messageInput}
                onChange={e => setMessageInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSend()}
                placeholder="Type a message"
            />
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={onFileUpload}
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
                onClick={onGenerate}
                disabled={generatingDraft}
                title={`Generate AI draft (${maxDraftParts} part${maxDraftParts > 1 ? 's' : ''})`}
            >
                {generatingDraft ? '⏳' : '🤖'}
            </button>
            <button onClick={onSend}>Send</button>
        </div>
    );
}
