import React from 'react';
import { Message, MediaItem } from '../../types';
import { formatTimestamp } from '../../utils/formatTimestamp';
import { MediaContent } from './MediaContent';

interface MessageBubbleProps {
    msg: Message;
    media: Record<string, MediaItem>;
    transcription?: string;
    onOpenLightbox: (lb: { mimetype: string; data: string }) => void;
}

export function MessageBubble({ msg, media, transcription, onOpenLightbox }: MessageBubbleProps) {
    return (
        <div className={`bubble ${msg.fromMe ? 'sent' : 'received'}`}>
            <MediaContent msg={msg} media={media} onOpenLightbox={onOpenLightbox} />
            {transcription && (
                <div className="transcription">
                    {transcription}
                </div>
            )}
            {msg.body && msg.type !== 'sticker' && <div>{msg.body}</div>}
            <span className="time">{formatTimestamp(msg.timestamp)}</span>
        </div>
    );
}
