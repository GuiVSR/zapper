import React from 'react';
import './Sidebar.css';

interface SidebarToolbarProps {
    messageLimit: number;
    setMessageLimit: (v: number) => void;
    maxDraftParts: number;
    setMaxDraftParts: (v: number) => void;
    multiSelectMode: boolean;
    toggleMultiSelect: () => void;
    // Select-tab actions
    onSelectUnread: () => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
    onGenerate: () => void;
    chatCount: number;
    unreadCount: number;
    selectedCount: number;
    multiGenerating: boolean;
}

export function SidebarToolbar({
    messageLimit, setMessageLimit,
    maxDraftParts, setMaxDraftParts,
    multiSelectMode, toggleMultiSelect,
    onSelectUnread, onSelectAll, onSelectNone, onGenerate,
    chatCount, unreadCount, selectedCount, multiGenerating,
}: SidebarToolbarProps) {
    return (
        <div className="sidebar-toolbar-container">
            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div className="sidebar-tabs">
                <button
                    className={`sidebar-tab ${!multiSelectMode ? 'active' : ''}`}
                    onClick={() => { if (multiSelectMode) toggleMultiSelect(); }}
                >
                    💬 Chats
                </button>
                <button
                    className={`sidebar-tab ${multiSelectMode ? 'active' : ''}`}
                    onClick={() => { if (!multiSelectMode) toggleMultiSelect(); }}
                >
                    ☑ Select
                </button>
            </div>

            {/* ── Chats tab content ────────────────────────────────────── */}
            {!multiSelectMode && (
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
                </div>
            )}

            {/* ── Select tab content ───────────────────────────────────── */}
            {multiSelectMode && (
                <div className="sidebar-select-panel">
                    <div className="select-actions">
                        <button
                            className="select-action-btn"
                            onClick={onSelectUnread}
                            disabled={unreadCount === 0}
                            title={`Select ${unreadCount} chat(s) with unread messages`}
                        >
                            <span className="select-action-emoji">🔵</span>
                            <span className="select-action-label">Unread</span>
                            {unreadCount > 0 && <span className="select-action-count">{unreadCount}</span>}
                        </button>
                        <button
                            className="select-action-btn"
                            onClick={onSelectAll}
                            title={`Select all ${chatCount} chats`}
                        >
                            <span className="select-action-emoji">✅</span>
                            <span className="select-action-label">All</span>
                        </button>
                        <button
                            className="select-action-btn"
                            onClick={onSelectNone}
                            disabled={selectedCount === 0}
                            title="Clear selection"
                        >
                            <span className="select-action-emoji">✕</span>
                            <span className="select-action-label">None</span>
                        </button>
                    </div>

                    <div className="select-generate-row">
                        <div className="limit-control">
                            <label>Parts</label>
                            <div className="stepper">
                                <button
                                    className="stepper-btn"
                                    onClick={() => setMaxDraftParts(Math.max(1, maxDraftParts - 1))}
                                    disabled={maxDraftParts <= 1}
                                    title="Decrease parts"
                                >−</button>
                                <span className="stepper-value">{maxDraftParts}</span>
                                <button
                                    className="stepper-btn"
                                    onClick={() => setMaxDraftParts(Math.min(10, maxDraftParts + 1))}
                                    disabled={maxDraftParts >= 10}
                                    title="Increase parts"
                                >+</button>
                            </div>
                        </div>

                        <button
                            className="btn-generate-multi"
                            disabled={selectedCount === 0 || multiGenerating}
                            onClick={onGenerate}
                        >
                            {multiGenerating
                                ? '⏳ Generating…'
                                : `🤖 Generate${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}