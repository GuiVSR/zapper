import { Message } from 'whatsapp-web.js';
import { WhatsAppClient } from '../client';
import { getLLMClient } from '../llm';
import { transcribeAudio } from '../transcription/deepgram';
import { saveDescription } from '../transcription/cache';
import chalk from 'chalk';
import {
    POOL_WINDOW_MS,
    HISTORY_CONTEXT,
    DEFAULT_SIDEBAR_CHATS,
    getMaxDraftParts,
} from '../constants';

import { PooledMessage, DraftCallback, TranscriptionCallback } from './types';
import { logMessage } from './logging';
import { enrichWithDescriptions } from './enrichment';

// Re-export types so existing imports from './messaging/messageHandler' still work
export type { PooledMessage, AIDraft, DraftCallback, TranscriptionCallback } from './types';

// ── Handler ───────────────────────────────────────────────────────────────────

export class MessageHandler {
    private client: WhatsAppClient;
    private webhookUrl?: string;
    private onDraft?: DraftCallback;
    private onTranscription?: TranscriptionCallback;

    public maxDraftParts: number = getMaxDraftParts();

    private pools  = new Map<string, PooledMessage[]>();
    private timers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(client: WhatsAppClient, webhookUrl?: string, onDraft?: DraftCallback, onTranscription?: TranscriptionCallback) {
        this.client          = client;
        this.webhookUrl      = webhookUrl;
        this.onDraft         = onDraft;
        this.onTranscription = onTranscription;
    }

    // ── Public entry point ────────────────────────────────────────────────────

    public async handleMessage(message: Message): Promise<void> {
        let contactName = 'Unknown';
        try {
            const contact = await message.getContact();
            contactName = contact.pushname || contact.name || contact.number || message.from;
        } catch {
            contactName = message.from;
        }

        logMessage(message, contactName);

        // Commands bypass pooling
        if (message.body?.startsWith('/')) {
            await this.handleCommand(message);
            return;
        }

        // ── Pool inbound messages ─────────────────────────────────────────────
        if (!message.fromMe && message.type === 'image') {
            try {
                console.log(chalk.blue(`[Vision] Analyzing image from ${message.from}…`));
                const media = await message.downloadMedia();
                if (media) {
                    const llm         = getLLMClient();
                    const description = await llm.analyzeImage(media.data, media.mimetype, message.id.id);
                    saveDescription(message.id.id, description);
                    console.log(chalk.blue(`[Vision] Description (preview): ${description.slice(0, 120)}…`));
                    this.poolMessage(message, undefined, description);
                } else {
                    this.poolMessage(message, undefined, '[Image could not be downloaded]');
                }
            } catch (err) {
                console.error(chalk.red('[Vision] Image analysis failed:'), err);
                this.poolMessage(message, undefined, '[Image analysis failed]');
            }
            await this.handleInboundImage(message);
        } else if (!message.fromMe && (message.type === 'audio' || message.type === 'ptt')) {
            await this.handleAudioTranscription(message);
        } else {
            this.poolMessage(message);
        }

        // Webhook forwarding (inbound only)
        if (this.webhookUrl && !message.fromMe) {
            await this.sendToWebhook(message);
        }
    }

    // ── Live image handling ───────────────────────────────────────────────────

    private async handleInboundImage(message: Message): Promise<void> {
        console.log(chalk.blue(`[Vision] Image received — ID: ${message.id.id}`));

        try {
            console.log(chalk.blue(`[Vision] Downloading media…`));
            const media = await message.downloadMedia();

            if (!media) {
                console.error(chalk.red(`[Vision] downloadMedia() returned null for ${message.id.id}`));
                this.poolMessage(message, '[Image could not be downloaded]');
                return;
            }

            console.log(chalk.blue(`[Vision] Downloaded — mime: ${media.mimetype}, size: ${(media.data.length / 1024).toFixed(1)} KB`));
            console.log(chalk.blue(`[Vision] Sending to vision model…`));

            const llm         = getLLMClient();
            const description = await llm.analyzeImage(media.data, media.mimetype, undefined, message.id.id);

            console.log(chalk.green(`[Vision] ✅ Description received (${description.length} chars)`));
            console.log(chalk.green(`[Vision] Preview: ${description.slice(0, 150)}…`));

            saveDescription(message.id.id, description);
            this.poolMessage(message, description);

        } catch (err: any) {
            console.error(chalk.red(`[Vision] ❌ Image analysis FAILED for ${message.id.id}:`));
            console.error(chalk.red(`[Vision] Error: ${err?.message ?? err}`));
            console.error(err);
            this.poolMessage(message, '[Image received — analysis failed]');
        }
    }

    // ── Pooling ───────────────────────────────────────────────────────────────

    private poolMessage(message: Message, overrideBody?: string, imageDescription?: string): void {
        if (message.fromMe) return;

        let body: string | undefined;

        switch (message.type) {
            case 'chat':
                body = message.body?.trim() || '';
                break;
            case 'image':
                body = message.body?.trim() || '[image]';
                break;
            case 'audio':
            case 'ptt':
                body = overrideBody ?? message.body ?? '';
                break;
            default:
                return;
        }

        // Accept text, image, and transcribed audio/ptt
        if (message.type !== 'chat' && message.type !== 'image' && !overrideBody) return;
        if (!body?.trim() && !imageDescription) return;

        const chatId: string = message.from;

        if (!this.pools.has(chatId)) {
            this.pools.set(chatId, []);
        }

        this.pools.get(chatId)!.push({
            id:               message.id.id,
            from:             message.from,
            to:               message.to,
            body:             body || '',
            timestamp:        message.timestamp,
            type:             message.type,
            fromMe:           message.fromMe,
            hasMedia:         message.hasMedia,
            imageDescription,
        });

        if (this.timers.has(chatId)) {
            clearTimeout(this.timers.get(chatId)!);
        }

        const timer = setTimeout(() => this.flushPool(chatId), POOL_WINDOW_MS);
        this.timers.set(chatId, timer);

        console.log(
            chalk.blue(
                `[Pooler] ${chatId} — pool size: ${this.pools.get(chatId)!.length}, ` +
                `timer reset to ${POOL_WINDOW_MS / 1000}s` +
                (imageDescription ? chalk.green(` [+vision desc ${imageDescription.length}c]`) : '')
            )
        );
    }

    private async handleAudioTranscription(message: Message): Promise<void> {
        if (message.fromMe) return;
        if (!message.hasMedia) return;

        try {
            const media = await message.downloadMedia();
            if (!media) {
                console.warn(chalk.yellow('[Transcription] Could not download audio media'));
                return;
            }

            const audioBuffer = Buffer.from(media.data, 'base64');
            const transcript = await transcribeAudio(audioBuffer, media.mimetype);

            if (!transcript) {
                console.warn(chalk.yellow(`[Transcription] No transcript returned for ${message.id.id}`));
                return;
            }

            saveDescription(message.id.id, transcript);
            console.log(chalk.green(`[Transcription] ✅ Saved to cache: ${message.id.id} (${transcript.length} chars)`));

            this.onTranscription?.({ messageId: message.id.id, chatId: message.from, transcript });

            const label = message.type === 'ptt' ? 'Voice message' : 'Audio';
            this.poolMessage(message, `[${label} transcription]: ${transcript}`);
        } catch (err) {
            console.error(chalk.red('[Transcription] Failed to transcribe audio:'), err);
        }
    }

    private async flushPool(chatId: string): Promise<void> {
        const pooledMessages = this.pools.get(chatId) ?? [];
        this.pools.delete(chatId);
        this.timers.delete(chatId);

        if (pooledMessages.length === 0 || !this.onDraft) return;

        console.log(chalk.blue(`[Pooler] Flushing ${pooledMessages.length} message(s) from ${chatId} → LLM`));

        try {
            let enrichedHistory: PooledMessage[] = [];
            try {
                const history   = await this.client.getChatHistory(chatId, HISTORY_CONTEXT + pooledMessages.length);
                const pooledIds = new Set(pooledMessages.map(m => m.id));
                const priorMsgs = history.filter(m => !pooledIds.has(m.id)).slice(-HISTORY_CONTEXT);

                enrichedHistory = await enrichWithDescriptions(this.client, priorMsgs);
            } catch {
                console.warn(chalk.yellow(`[Pooler] Could not fetch history for ${chatId}, proceeding without context`));
            }

            const fullContext = [...enrichedHistory, ...pooledMessages];
            const maxParts    = this.maxDraftParts;

            const llm   = getLLMClient();
            const parts = await llm.generateWhatsAppDraft(fullContext, maxParts);

            this.onDraft({
                chatId,
                parts,
                basedOnMessages: pooledMessages,
                generatedAt: Math.floor(Date.now() / 1000),
            });

            console.log(chalk.blue(
                `[Pooler] Draft generated for ${chatId} — ${parts.length} part(s) ` +
                `(context: ${enrichedHistory.length} prior + ${pooledMessages.length} new)`
            ));
        } catch (err) {
            console.error(chalk.red(`[Pooler] Failed to generate draft for ${chatId}:`), err);
        }
    }

    public async generateDraftsForChats(chatIds: string[], limit: number, maxParts?: number): Promise<void> {
        const resolvedMaxParts = maxParts ?? this.maxDraftParts;
        this.maxDraftParts = resolvedMaxParts;

        for (const chatId of chatIds) {
            try {
                const history = await this.client.getChatHistory(chatId, limit);
                if (history.length === 0) continue;

                const enrichedHistory = await enrichWithDescriptions(this.client, history);

                const llm   = getLLMClient();
                const parts = await llm.generateWhatsAppDraft(enrichedHistory, resolvedMaxParts);

                this.onDraft?.({
                    chatId,
                    parts,
                    basedOnMessages: enrichedHistory,
                    generatedAt: Math.floor(Date.now() / 1000),
                });

                console.log(chalk.blue(
                    `[OnDemand] Draft generated for ${chatId} — ${parts.length} part(s), ` +
                    `maxParts=${resolvedMaxParts} (${history.length} messages)`
                ));
            } catch (err) {
                console.error(chalk.red(`[OnDemand] Failed for ${chatId}:`), err);
            }
        }
    }

    public destroy(): void {
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.pools.clear();
        this.timers.clear();
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    private async handleCommand(message: Message): Promise<void> {
        const [command] = message.body.slice(1).split(' ');

        switch (command.toLowerCase()) {
            case 'ping':
                console.log(chalk.blue('🏓 Sending pong...'));
                await this.client.sendMessage(message.from, 'pong');
                break;

            case 'help':
                await this.client.sendMessage(message.from, [
                    'Available commands:',
                    '/ping   — Check if bot is alive',
                    '/help   — Show this help',
                    '/status — Show bot status',
                    '/chats  — List recent chats',
                ].join('\n'));
                break;

            case 'status':
                await this.client.sendMessage(
                    message.from,
                    `Bot Status: ${this.client.isReady() ? '✅ Connected' : '❌ Disconnected'}`
                );
                break;

            case 'chats': {
                const chats       = await this.client.getChats();
                const recentChats = chats.slice(0, DEFAULT_SIDEBAR_CHATS)
                    .map(c => `- ${c.name || c.id.user}: ${c.lastMessage?.body || 'No messages'}`)
                    .join('\n');
                await this.client.sendMessage(message.from, `Recent chats:\n${recentChats}`);
                break;
            }

            default:
                await this.client.sendMessage(message.from, 'Unknown command. Type /help for available commands.');
        }
    }

    // ── Webhook ───────────────────────────────────────────────────────────────

    private async sendToWebhook(message: Message): Promise<void> {
        try {
            let contactInfo = null;
            try {
                const contact = await message.getContact();
                contactInfo = {
                    number:   contact.number,
                    name:     contact.name,
                    pushname: contact.pushname,
                };
            } catch { /* ok */ }

            const payload = {
                id:          message.id.id,
                from:        message.from,
                to:          message.to,
                body:        message.body,
                timestamp:   message.timestamp,
                type:        message.type,
                hasMedia:    message.hasMedia,
                fromMe:      message.fromMe,
                contact:     contactInfo,
                deviceType:  message.deviceType,
                isForwarded: message.isForwarded,
                isStatus:    message.isStatus,
            };

            const response = await fetch(this.webhookUrl!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                console.error(`Webhook failed with status: ${response.status}`);
            }
        } catch (err) {
            console.error('Failed to send webhook:', err);
        }
    }
}