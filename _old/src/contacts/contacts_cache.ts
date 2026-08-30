// ─────────────────────────────────────────────────────────────────────────────
// contactCache.ts — persists WhatsApp contact display names to disk so the
// sidebar can show nicknames instead of phone numbers without blocking startup.
//
// On first load, returns whatever is cached (possibly empty). A background
// refresh fills in missing names and writes through to disk. Subsequent
// requests are instant.
// ─────────────────────────────────────────────────────────────────────────────

import fs   from 'fs';
import path from 'path';
import chalk from 'chalk';
import { WhatsAppClient } from '../client';

const TMP_DIR    = path.resolve('tmp');
const CACHE_PATH = path.join(TMP_DIR, '.contact-names.json');

// Ensure tmp/ exists on first import
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

interface ContactEntry {
    name: string;        // resolved display name
    updatedAt: number;   // epoch ms — so we can re-check stale entries
}

type Cache = Record<string, ContactEntry>; // chatId → entry

// ── In-memory layer ───────────────────────────────────────────────────────────
let _cache: Cache | null = null;
let _refreshing = false;

/** How long before a cached name is considered stale and re-checked (1 hour). */
const STALE_MS = 60 * 60 * 1000;

function getCache(): Cache {
    if (_cache !== null) return _cache;

    try {
        if (fs.existsSync(CACHE_PATH)) {
            _cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as Cache;
            const count = Object.keys(_cache).length;
            console.log(chalk.gray(`[ContactCache] Loaded ${count} cached name(s) from tmp/`));
        } else {
            _cache = {};
            console.log(chalk.gray(`[ContactCache] No cache file found — starting fresh`));
        }
    } catch (err) {
        console.warn(chalk.yellow(`[ContactCache] Cache file corrupt — starting fresh. Error: ${err}`));
        _cache = {};
    }

    return _cache;
}

function persistToDisk(): void {
    try {
        fs.writeFileSync(CACHE_PATH, JSON.stringify(_cache, null, 2), 'utf-8');
    } catch (err) {
        console.error(chalk.red(`[ContactCache] Failed to write cache to disk: ${err}`));
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the cached display name for a chat ID, or undefined if not yet resolved.
 */
export function getCachedName(chatId: string): string | undefined {
    return getCache()[chatId]?.name;
}

/**
 * Returns all cached names as a map of chatId → displayName.
 */
export function getAllCachedNames(): Record<string, string> {
    const cache = getCache();
    const result: Record<string, string> = {};
    for (const [id, entry] of Object.entries(cache)) {
        result[id] = entry.name;
    }
    return result;
}

/**
 * Kick off a background refresh for a list of chat IDs.
 * Non-blocking — returns immediately. Resolves names for any chat IDs that
 * are missing or stale, then persists the updated cache to disk.
 */
export function refreshContactNames(
    client: WhatsAppClient,
    chatIds: string[],
): void {
    if (_refreshing) return; // don't overlap
    _refreshing = true;

    const cache = getCache();
    const now   = Date.now();

    // Filter to IDs that need resolving (missing or stale)
    const toResolve = chatIds.filter(id => {
        const entry = cache[id];
        if (!entry) return true;
        return (now - entry.updatedAt) > STALE_MS;
    });

    if (toResolve.length === 0) {
        _refreshing = false;
        return;
    }

    console.log(chalk.gray(`[ContactCache] Resolving ${toResolve.length} contact name(s) in background…`));

    // Fire-and-forget async work
    (async () => {
        let resolved = 0;

        for (const chatId of toResolve) {
            try {
                const contact = await client.getContactInfo(chatId);
                if (contact) {
                    const displayName = contact.name || contact.pushname || '';
                    if (displayName) {
                        cache[chatId] = { name: displayName, updatedAt: Date.now() };
                        resolved++;
                    }
                }
            } catch {
                // Skip — will retry on next refresh cycle
            }
        }

        if (resolved > 0) {
            persistToDisk();
            console.log(chalk.green(
                `[ContactCache] ✅ Resolved ${resolved} name(s) — cache now has ${Object.keys(cache).length} entries`
            ));
        }

        _refreshing = false;
    })().catch(err => {
        console.error(chalk.red(`[ContactCache] Background refresh failed: ${err}`));
        _refreshing = false;
    });
}