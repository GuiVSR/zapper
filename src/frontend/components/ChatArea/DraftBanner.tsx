import React from 'react';
import { AIDraft } from '../../types';
import { formatTimestamp } from '../../utils/formatTimestamp';
import './DraftBanner.css';

interface DraftBannerProps {
    draft: AIDraft;
    onDiscard: () => void;
    onRemovePart: (chatId: string, idx: number) => void;
    onUpdatePart: (chatId: string, idx: number, value: string) => void;
    onMergeParts: (chatId: string) => void;
    onEditDraft: () => void;
    onSendAllParts: () => void;
    onSendPart: (chatId: string, idx: number) => void;
}

export function DraftBanner({
    draft, onDiscard, onRemovePart, onUpdatePart,
    onMergeParts, onEditDraft, onSendAllParts, onSendPart,
}: DraftBannerProps) {
    const isMultiPart = draft.parts.length > 1;

    return (
        <div className="draft-banner">
            <div className="draft-header">
                <span className="draft-label">
                    🤖 AI Draft
                    {isMultiPart && (
                        <span className="draft-parts-badge">
                            {draft.parts.length} parts
                        </span>
                    )}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="draft-time">{formatTimestamp(draft.generatedAt)}</span>
                    <button className="btn-discard" onClick={onDiscard}>✕ Discard all</button>
                </div>
            </div>

            <div className="draft-parts">
                {draft.parts.map((part, idx) => (
                    <div key={idx} className="draft-part">
                        <div className="draft-part-header">
                            {isMultiPart && (
                                <span className="draft-part-num">Part {idx + 1}</span>
                            )}
                            <button
                                className="btn-part-remove"
                                onClick={() => onRemovePart(draft.chatId, idx)}
                                title="Remove this part"
                            >✕</button>
                        </div>
                        <textarea
                            className="draft-body draft-body-editable"
                            value={part}
                            onChange={e => onUpdatePart(draft.chatId, idx, e.target.value)}
                            rows={Math.max(2, part.split('\n').length)}
                        />
                        <div className="draft-part-actions">
                            <button
                                className="btn-send btn-send-part"
                                onClick={() => onSendPart(draft.chatId, idx)}
                            >
                                ✅ Send this
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="draft-actions">
                <button className="btn-send" onClick={onSendAllParts}>
                    {isMultiPart ? `✅ Send all ${draft.parts.length}` : '✅ Send'}
                </button>
                {isMultiPart && (
                    <button className="btn-edit" onClick={() => onMergeParts(draft.chatId)}>
                        ⊕ Merge
                    </button>
                )}
                <button className="btn-edit" onClick={onEditDraft}>✏️ Edit in input</button>
            </div>
        </div>
    );
}
