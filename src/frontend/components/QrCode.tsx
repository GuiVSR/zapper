import React from 'react';

interface QrCodeProps {
    qrCode: string;
}

export function QrCode({ qrCode }: QrCodeProps) {
    if (!qrCode) return null;
    return (
        <div className="qr">
            <h3>Scan QR Code</h3>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`} alt="QR" />
        </div>
    );
}
