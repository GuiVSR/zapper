import React from 'react';
import '../App.global.css';

interface ErrorBarProps {
    error: string;
}

export function ErrorBar({ error }: ErrorBarProps) {
    if (!error) return null;
    return <div className="error-bar">⚠ {error}</div>;
}
