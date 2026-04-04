import React from 'react';

interface LightboxProps {
    lightbox: { mimetype: string; data: string } | null;
    onClose: () => void;
}

export function Lightbox({ lightbox, onClose }: LightboxProps) {
    if (!lightbox) return null;
    return (
        <div className="lightbox" onClick={onClose}>
            {lightbox.mimetype.startsWith('video/') ? (
                <video
                    className="lightbox-video"
                    src={`data:${lightbox.mimetype};base64,${lightbox.data}`}
                    controls
                    autoPlay
                    onClick={e => e.stopPropagation()}
                />
            ) : (
                <img
                    src={`data:${lightbox.mimetype};base64,${lightbox.data}`}
                    alt="full size"
                    onClick={e => e.stopPropagation()}
                />
            )}
            <button className="lightbox-close" onClick={onClose}>✕</button>
        </div>
    );
}
