// ─────────────────────────────────────────────────────────────────────────────
// imageCache.ts — persists AI-generated image descriptions to disk.
// Keyed by message ID so descriptions survive server restarts and are
// automatically attached to any future draft that includes those messages.
// ─────────────────────────────────────────────────────────────────────────────
import fs   from 'fs';
import path from 'path';

const CACHE_PATH = path.resolve('.image-descriptions.json');

type Cache = Record<string, string>; // messageId → description

function load(): Cache {
    try {
        if (fs.existsSync(CACHE_PATH)) {
            return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
        }
    } catch { /* corrupt file — start fresh */ }
    return {};
}

function save(cache: Cache): void {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

/** Persist a description for a given message ID. */
export function saveDescription(messageId: string, description: string): void {
    const cache = load();
    cache[messageId] = description;
    save(cache);
}

/** Retrieve a single cached description (or undefined if not yet analysed). */
export function getDescription(messageId: string): string | undefined {
    return load()[messageId];
}

/**
 * Retrieve descriptions for a batch of message IDs in one disk read.
 * Only returns entries that exist in the cache — missing IDs are omitted.
 */
export function getDescriptions(messageIds: string[]): Record<string, string> {
    const cache  = load();
    const result: Record<string, string> = {};
    for (const id of messageIds) {
        if (cache[id]) result[id] = cache[id];
    }
    return result;
}