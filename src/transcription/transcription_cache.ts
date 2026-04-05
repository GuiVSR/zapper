// ─────────────────────────────────────────────────────────────────────────────
// imageCache.ts — persists AI-generated image descriptions to disk and keeps
// an in-memory copy so:
//   • every lookup is O(1) with no disk I/O after the first load
//   • descriptions survive server restarts (written to tmp/.descriptions.json)
//   • an image is NEVER sent to the vision model twice
// ─────────────────────────────────────────────────────────────────────────────

import fs   from 'fs';
import path from 'path';
import chalk from 'chalk';

const TMP_DIR    = path.resolve('tmp');
const CACHE_PATH = path.join(TMP_DIR, '.descriptions.json');

// Ensure tmp/ exists on first import
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

type Cache = Record<string, string>; // messageId → description

// ── In-memory layer ───────────────────────────────────────────────────────────
let _cache: Cache | null = null;

function getCache(): Cache {
    if (_cache !== null) return _cache;

    try {
        if (fs.existsSync(CACHE_PATH)) {
            _cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as Cache;
            const count = Object.keys(_cache).length;
            console.log(chalk.gray(`[ImageCache] Loaded ${count} cached description(s) from tmp/`));
        } else {
            _cache = {};
            console.log(chalk.gray(`[ImageCache] No cache file found — starting fresh`));
        }
    } catch (err) {
        console.warn(chalk.yellow(`[ImageCache] Cache file corrupt — starting fresh. Error: ${err}`));
        _cache = {};
    }

    return _cache;
}

function persistToDisk(): void {
    try {
        fs.writeFileSync(CACHE_PATH, JSON.stringify(_cache, null, 2), 'utf-8');
    } catch (err) {
        console.error(chalk.red(`[ImageCache] Failed to write cache to disk: ${err}`));
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true if a description already exists for this message ID. */
export function hasDescription(messageId: string): boolean {
    return messageId in getCache();
}

/** Retrieve a single cached description (or undefined if not yet analysed). */
export function getDescription(messageId: string): string | undefined {
    return getCache()[messageId];
}

/**
 * Retrieve descriptions for a batch of message IDs in one call.
 * Only returns entries that exist in the cache — missing IDs are omitted.
 */
export function getDescriptions(messageIds: string[]): Record<string, string> {
    const cache  = getCache();
    const result: Record<string, string> = {};
    for (const id of messageIds) {
        if (cache[id] !== undefined) result[id] = cache[id];
    }
    return result;
}

/**
 * Persist a description for a given message ID.
 * Updates the in-memory cache immediately and writes through to disk.
 */
export function saveDescription(messageId: string, description: string): void {
    const cache = getCache();
    if (cache[messageId] === description) return; // no-op if unchanged

    cache[messageId] = description;
    persistToDisk();

    console.log(chalk.gray(
        `[ImageCache] Saved description for ${messageId} ` +
        `(${description.length} chars) — cache now has ${Object.keys(cache).length} entries`
    ));
}

/** Returns the total number of cached descriptions. */
export function cacheSize(): number {
    return Object.keys(getCache()).length;
}