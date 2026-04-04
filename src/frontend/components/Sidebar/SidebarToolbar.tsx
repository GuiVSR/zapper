import React from 'react';

interface SidebarToolbarProps {
    messageLimit: number;
    setMessageLimit: (v: number) => void;
    maxDraftParts: number;
    setMaxDraftParts: (v: number) => void;
    multiSelectMode: boolean;
    toggleMultiSelect: () => void;
}

export function SidebarToolbar({
    messageLimit, setMessageLimit,
    maxDraftParts, setMaxDraftParts,
    multiSelectMode, toggleMultiSelect,
}: SidebarToolbarProps) {
    return (
        <div className="sidebar-toolbar">
            <div className="limit-control">
                <label htmlFor="msg-limit">Msgs</label>
                <input
                    id="msg-limit"
                    type="number"
                    min={1}
                    max={100}
                    value={messageLimit}
                    onChange={e => setMessageLimit(Math.max(1, parseInt(e.target.value) || 1))}
                    title="Number of recent messages sent to the AI as context"
                />
            </div>
            <div className="limit-control">
                <label htmlFor="parts-limit">Parts</label>
                <input
                    id="parts-limit"
                    type="number"
                    min={1}
                    max={10}
                    value={maxDraftParts}
                    onChange={e => setMaxDraftParts(Math.max(1, parseInt(e.target.value) || 1))}
                    title="Max number of message parts the AI should split its reply into"
                />
            </div>
            <button
                className={`btn-multiselect ${multiSelectMode ? 'active' : ''}`}
                onClick={toggleMultiSelect}
                title="Select multiple chats to generate drafts"
            >
                {multiSelectMode ? '✕ Cancel' : '☑ Select'}
            </button>
        </div>
    );
}
