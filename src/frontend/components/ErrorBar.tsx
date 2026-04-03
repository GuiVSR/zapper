import React from 'react';

interface ErrorBarProps {
    error: string;
}

export function ErrorBar({ error }: ErrorBarProps) {
    if (!error) return null;
    return <div className="error-bar">⚠ {error}</div>;
}
