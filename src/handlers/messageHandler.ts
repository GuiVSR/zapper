import { Message } from 'whatsapp-web.js';
import { WhatsAppClient } from '../client';
import { getLLMClient } from '../llm';
import chalk from 'chalk';
import { POOL_WINDOW_MS, HISTORY_CONTEXT, DEFAULT_SIDEBAR_CHATS, getMaxDraftParts } from '../constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PooledMessage {
    id: string;
    from: string;
    to: string;
    body: string;
    timestamp: number;
    type: string;
    fromMe: boolean;
    hasMedia: boolean;
}

export interface AIDraft {
    chatId: string;
    /** One element per message part. Single-part drafts have length 1. */
    parts: string[];
    basedOnMessages: PooledMessage[];
    generatedAt: number;
}

export type DraftCallback = (draft: AIDraft) => void;

// ── Config ────────────────────────────────────────────────────────────────────

export class MessageHandler {
    private client: WhatsAppClient;
    private webhookUrl?: string;
    private onDraft?: DraftCallback;

    // Runtime-settable — updated by the API whenever the frontend changes the value
    public maxDraftParts: number = getMaxDraftParts();

    // Pooling state — one entry per chatId
    private pools  = new Map<string, PooledMessage[]>();
    private timers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(client: WhatsAppClient, webhookUrl?: string, onDraft?: DraftCallback) {
        this.client    = client;
        this.webhookUrl = webhookUrl;
        this.onDraft   = onDraft;
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

        const timestamp  = new Date().toLocaleString();
        const isFromMe   = message.fromMe;
        const sender     = isFromMe ? '📤 You' : `📥 ${contactName}`;

        console.log('\n' + '═'.repeat(60));
        console.log(chalk.cyan(`[${timestamp}]`));
        console.log(chalk.yellow(`${sender}`));
        console.log(chalk.green(`From: ${message.from}`));
        console.log(chalk.gray(`ID: ${message.id.id}`));

        switch (message.type) {
            case 'chat':
                console.log(chalk.white(`💬 Message: ${message.body}`));
                break;
            case 'image':
                console.log(chalk.magenta(`🖼️  Image received`));
                if (message.body) console.log(chalk.white(`Caption: ${message.body}`));
                break;
            case 'video':
                console.log(chalk.magenta(`🎥 Video received`));
                if (message.body) console.log(chalk.white(`Caption: ${message.body}`));
                break;
            case 'audio':
                console.log(chalk.magenta(`🎵 Audio received`));
                break;
            case 'document':
                console.log(chalk.magenta(`📄 Document received`));
                if (message.body) console.log(chalk.white(`Caption: ${message.body}`));
                break;
            case 'sticker':
                console.log(chalk.magenta(`🎨 Sticker received`));
                break;
            case 'location':
                console.log(chalk.magenta(`📍 Location received`));
                break;
            case 'buttons_response':
                console.log(chalk.magenta(`🔘 Button response: ${message.body}`));
                break;
            case 'list_response':
                console.log(chalk.magenta(`📋 List response: ${message.body}`));
                break;
            default:
                console.log(chalk.white(`${message.type}: ${message.body || 'No content'}`));
        }

        if (message.hasMedia) {
            console.log(chalk.gray(`📎 Has media attachment`));
            try {
                const media = await message.downloadMedia();
                if (media) {
                    console.log(chalk.gray(`   MIME type: ${media.mimetype}`));
                    console.log(chalk.gray(`   Size: ${(media.data.length / 1024).toFixed(2)} KB`));
                }
            } catch {
                console.log(chalk.gray(`   Could not get media info`));
            }
        }

        console.log('═'.repeat(60) + '\n');

        // Commands bypass pooling
        if (message.body?.startsWith('/')) {
            await this.handleCommand(message);
            return;
        }

        // Pool inbound text messages for AI draft generation
        this.poolMessage(message);

        // Webhook forwarding (inbound only)
        if (this.webhookUrl && !isFromMe) {
            await this.sendToWebhook(message);
        }
    }

    // ── Pooling ───────────────────────────────────────────────────────────────

    private poolMessage(message: Message): void {
        if (message.fromMe)              return;
        if (message.type !== 'chat')     return;
        if (!message.body?.trim())       return;

        const chatId: string = message.from;

        if (!this.pools.has(chatId)) {
            this.pools.set(chatId, []);
        }

        this.pools.get(chatId)!.push({
            id:        message.id.id,
            from:      message.from,
            to:        message.to,
            body:      message.body,
            timestamp: message.timestamp,
            type:      message.type,
            fromMe:    message.fromMe,
            hasMedia:  message.hasMedia,
        });

        if (this.timers.has(chatId)) {
            clearTimeout(this.timers.get(chatId)!);
        }

        const timer = setTimeout(() => this.flushPool(chatId), POOL_WINDOW_MS);
        this.timers.set(chatId, timer);

        console.log(
            chalk.blue(
                `[Pooler] ${chatId} — pool size: ${this.pools.get(chatId)!.length}, ` +
                `timer reset to ${POOL_WINDOW_MS / 1000}s`
            )
        );
    }

    private async flushPool(chatId: string): Promise<void> {
        const pooledMessages = this.pools.get(chatId) ?? [];
        this.pools.delete(chatId);
        this.timers.delete(chatId);

        if (pooledMessages.length === 0 || !this.onDraft) return;

        console.log(
            chalk.blue(`[Pooler] Flushing ${pooledMessages.length} message(s) from ${chatId} → Groq`)
        );

        try {
            let historyContext: PooledMessage[] = [];
            try {
                const history = await this.client.getChatHistory(chatId, HISTORY_CONTEXT + pooledMessages.length);
                const pooledIds = new Set(pooledMessages.map(m => m.id));
                historyContext = history
                    .filter(m => !pooledIds.has(m.id))
                    .slice(-HISTORY_CONTEXT);
            } catch (err) {
                console.warn(chalk.yellow(`[Pooler] Could not fetch history for ${chatId}, proceeding without context`));
            }

            const fullContext = [...historyContext, ...pooledMessages];
            const maxParts    = this.maxDraftParts;

            const llm   = getLLMClient();
            const parts = await llm.generateWhatsAppDraft(fullContext, maxParts);

            this.onDraft({
                chatId,
                parts,
                basedOnMessages: pooledMessages,
                generatedAt: Math.floor(Date.now() / 1000),
            });

            console.log(chalk.blue(`[Pooler] Draft generated for ${chatId} — ${parts.length} part(s) (context: ${historyContext.length} prior + ${pooledMessages.length} new)`));
        } catch (err) {
            console.error(chalk.red(`[Pooler] Failed to generate draft for ${chatId}:`), err);
        }
    }

    /**
     * On-demand draft generation — called by the API endpoint.
     * maxParts is passed explicitly so the frontend value is always respected.
     */
    public async generateDraftsForChats(chatIds: string[], limit: number, maxParts?: number): Promise<void> {
        const resolvedMaxParts = maxParts ?? this.maxDraftParts;
        // Keep the stored value in sync so the auto-pool uses the same setting
        this.maxDraftParts = resolvedMaxParts;

        for (const chatId of chatIds) {
            try {
                const history = await this.client.getChatHistory(chatId, limit);
                if (history.length === 0) continue;

                const llm   = getLLMClient();
                const parts = await llm.generateWhatsAppDraft(history, resolvedMaxParts);

                this.onDraft?.({
                    chatId,
                    parts,
                    basedOnMessages: history,
                    generatedAt: Math.floor(Date.now() / 1000),
                });

                console.log(chalk.blue(`[OnDemand] Draft generated for ${chatId} — ${parts.length} part(s), maxParts=${resolvedMaxParts} (${history.length} messages)`));
            } catch (err) {
                console.error(chalk.red(`[OnDemand] Failed for ${chatId}:`), err);
            }
        }
    }

    /** Cancel all pending timers — call this on server shutdown. */
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
                const chats      = await this.client.getChats();
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