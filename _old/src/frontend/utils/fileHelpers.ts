import { MediaItem } from '../types';

export const ACCEPTED_FILE_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
].join(',');

export function getFileIcon(mimetype: string): string {
    if (mimetype === 'application/pdf') return '📕';
    if (mimetype.includes('word') || mimetype === 'application/msword') return '📘';
    if (mimetype.includes('spreadsheet') || mimetype.includes('ms-excel')) return '📗';
    if (mimetype.includes('presentation')) return '📙';
    if (mimetype.startsWith('image/')) return '🖼️';
    return '📄';
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function downloadDocument(item: MediaItem): void {
    const link = document.createElement('a');
    link.href = `data:${item.mimetype};base64,${item.data}`;
    link.download = item.filename || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
