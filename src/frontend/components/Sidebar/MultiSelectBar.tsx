import React from 'react';

interface MultiSelectBarProps {
    selectedChatIds: Set<string>;
    multiGenerating: boolean;
    onGenerate: () => void;
}

export function MultiSelectBar({ selectedChatIds, multiGenerating, onGenerate }: MultiSelectBarProps) {
    return (
        <div className="multi-generate-bar">
            <span className="multi-count">
                {selectedChatIds.size === 0
                    ? 'Select chats below'
                    : `${selectedChatIds.size} chat${selectedChatIds.size > 1 ? 's' : ''} selected`}
            </span>
            <button
                className="btn-generate-multi"
                disabled={selectedChatIds.size === 0 || multiGenerating}
                onClick={onGenerate}
            >
                {multiGenerating ? '⏳ Generating…' : '🤖 Generate'}
            </button>
        </div>
    );
}
