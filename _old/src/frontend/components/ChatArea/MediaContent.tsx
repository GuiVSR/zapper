import React from 'react';
import { Message, MediaItem } from '../../types';
import { getFileIcon, formatFileSize, downloadDocument } from '../../utils/fileHelpers';
import './MediaContent.css';

interface MediaContentProps {
    msg: Message;
    media: Record<string, MediaItem>;
    onOpenLightbox: (lb: { mimetype: string; data: string }) => void;
}

export function MediaContent({ msg, media, onOpenLightbox }: MediaContentProps) {
    const item = media[msg.id];

    if (!item) {
        if (!msg.hasMedia) return null;
        const placeholders: Record<string, string> = {
            image:    '🖼️ Loading image…',
            video:    '🎥 Loading video…',
            audio:    '🎵 Loading audio…',
            ptt:      '🎵 Loading audio…',
            sticker:  '🎨 Loading sticker…',
            document: '📄 Loading document…',
        };
        return <div className="media-placeholder">{placeholders[msg.type] || '📎 Media'}</div>;
    }

    // Sticker
    if (item.isSticker || msg.type === 'sticker') {
        return (
            <img
                className="bubble-sticker"
                src={`data:${item.mimetype};base64,${item.data}`}
                alt="sticker"
            />
        );
    }

    // Image
    if (item.mimetype.startsWith('image/')) {
        return (
            <img
                className="bubble-image"
                src={`data:${item.mimetype};base64,${item.data}`}
                alt="received image"
                onClick={() => onOpenLightbox({ mimetype: item.mimetype, data: item.data })}
            />
        );
    }

    // Video
    if (item.mimetype.startsWith('video/')) {
        return (
            <div
                className="bubble-video-container"
                onClick={() => onOpenLightbox({ mimetype: item.mimetype, data: item.data })}
            >
                <video
                    className="bubble-video"
                    src={`data:${item.mimetype};base64,${item.data}`}
                    muted
                    preload="metadata"
                />
                <div className="video-play-overlay">▶</div>
            </div>
        );
    }

    // Audio
    if (item.mimetype.startsWith('audio/')) {
        return (
            <audio
                className="bubble-audio"
                controls
                src={`data:${item.mimetype};base64,${item.data}`}
            />
        );
    }

    // Document
    if (msg.type === 'document' || item.filename) {
        const sizeBytes = Math.round(item.data.length * 0.75);
        return (
            <div className="bubble-document" onClick={() => downloadDocument(item)}>
                <span className="doc-icon">{getFileIcon(item.mimetype)}</span>
                <div className="doc-info">
                    <span className="doc-name">{item.filename || 'Document'}</span>
                    <span className="doc-size">{formatFileSize(sizeBytes)}</span>
                </div>
                <span className="doc-download">⬇</span>
            </div>
        );
    }

    return null;
}
