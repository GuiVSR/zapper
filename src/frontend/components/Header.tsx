import React from 'react';

interface HeaderProps {
    status: string;
    loggingOut: boolean;
    onLogout: () => void;
}

export function Header({ status, loggingOut, onLogout }: HeaderProps) {
    return (
        <header className="header">
            <h1>Zapper</h1>
            <span className="status-pill">{status}</span>
            <button
                className="btn-logout"
                onClick={onLogout}
                disabled={loggingOut}
                title="Logout from WhatsApp"
            >
                {loggingOut ? '⏳' : '⏏ Logout'}
            </button>
        </header>
    );
}
