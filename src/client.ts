import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

export interface MessageHandler {
    (message: Message): void;
}

export interface StickerHandler {
    (sticker: StickerInfo): void;
}

export interface StickerInfo {
    message: Message;
    data: Buffer;
    mimeType: string;
    isAnimated: boolean;
    fileSize: number;
    dimensions?: { width: number; height: number };
    savedPath?: string; // Add this optional property
}

export interface WhatsAppClientConfig {
    headless?: boolean;
    onQR?: (qr: string) => void;
    onReady?: () => void;
    onMessage?: MessageHandler;
    onSticker?: StickerHandler;
    onAuthFailure?: (msg: string) => void;
    onDisconnected?: (reason: string) => void;
    onError?: (error: Error) => void;
    stickersDir?: string; // Directory to save stickers
}

export class WhatsAppClient {
    private client: Client;
    private config: WhatsAppClientConfig;
    private isInitialized: boolean = false;
    private stickersDir: string;

    constructor(config: WhatsAppClientConfig = {}) {
        this.config = {
            headless: true,
            stickersDir: './stickers',
            ...config
        };

        this.stickersDir = this.config.stickersDir!;
        
        // Create stickers directory if it doesn't exist
        if (!fs.existsSync(this.stickersDir)) {
            fs.mkdirSync(this.stickersDir, { recursive: true });
        }

        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: this.config.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        // Handle QR code
        this.client.on('qr', (qr: string) => {
            if (this.config.onQR) {
                this.config.onQR(qr);
            } else {
                console.log('📱 Scan this QR code with WhatsApp:');
                qrcode.generate(qr, { small: true });
            }
        });

        // Handle ready event
        this.client.on('ready', () => {
            this.isInitialized = true;
            if (this.config.onReady) {
                this.config.onReady();
            } else {
                console.log('✅ WhatsApp client is ready!');
            }
        });

        // Handle messages with sticker detection
        this.client.on('message', async (message: Message) => {
            // Check if it's a sticker message
            if (message.type === 'sticker') {
                await this.handleSticker(message);
            }
            
            // Pass to regular message handler if provided
            if (this.config.onMessage) {
                this.config.onMessage(message);
            }
        });

        // Handle auth failure
        this.client.on('auth_failure', (msg: string) => {
            if (this.config.onAuthFailure) {
                this.config.onAuthFailure(msg);
            } else {
                console.error('❌ Authentication failed:', msg);
            }
        });

        // Handle disconnection
        this.client.on('disconnected', (reason: string) => {
            this.isInitialized = false;
            if (this.config.onDisconnected) {
                this.config.onDisconnected(reason);
            } else {
                console.log('❌ Client disconnected:', reason);
            }
        });

        // Handle errors
        this.client.on('error', (error: Error) => {
            if (this.config.onError) {
                this.config.onError(error);
            } else {
                console.error('❌ Error:', error);
            }
        });
    }

    private async handleSticker(message: Message): Promise<void> {
        try {
            // Download sticker media
            const media = await message.downloadMedia();
            
            if (!media) {
                console.error('Failed to download sticker media');
                return;
            }

            // Convert base64 to buffer
            const buffer = Buffer.from(media.data, 'base64');
            
            // Determine if it's animated (webp with multiple frames or video)
            const isAnimated = media.mimetype === 'image/webp' && await this.isAnimatedWebp(buffer);
            
            // Get sticker info
            const stickerInfo: StickerInfo = {
                message,
                data: buffer,
                mimeType: media.mimetype,
                isAnimated,
                fileSize: buffer.length
            };

            // Try to get dimensions
            try {
                const metadata = await sharp(buffer).metadata();
                stickerInfo.dimensions = {
                    width: metadata.width || 0,
                    height: metadata.height || 0
                };
            } catch (error) {
                // Dimensions not available
            }

            // Save sticker to file
            const timestamp = Date.now();
            const filename = `sticker_${timestamp}_${message.id.id}.webp`;
            const filepath = path.join(this.stickersDir, filename);
            fs.writeFileSync(filepath, buffer);
            
            stickerInfo['savedPath'] = filepath;

            // Call sticker handler if provided
            if (this.config.onSticker) {
                this.config.onSticker(stickerInfo);
            } else {
                // Default sticker display
                this.displaySticker(stickerInfo);
            }
        } catch (error) {
            console.error('Error handling sticker:', error);
        }
    }

    private async isAnimatedWebp(buffer: Buffer): Promise<boolean> {
        try {
            // Simple check for animated webp by looking for ANIM chunk
            const header = buffer.toString('ascii', 0, 12);
            return header.includes('ANIM');
        } catch (error) {
            return false;
        }
    }

    private displaySticker(stickerInfo: StickerInfo): void {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🎨 Sticker received!`);
        console.log(`From: ${stickerInfo.message.from}`);
        console.log(`Type: ${stickerInfo.isAnimated ? 'Animated' : 'Static'}`);
        console.log(`Size: ${(stickerInfo.fileSize / 1024).toFixed(2)} KB`);
        if (stickerInfo.dimensions) {
            console.log(`Dimensions: ${stickerInfo.dimensions.width}x${stickerInfo.dimensions.height}`);
        }
        if ('savedPath' in stickerInfo) {
            console.log(`Saved to: ${stickerInfo.savedPath}`);
        }
        
        // ASCII art representation (simplified)
        console.log('\n[Sticker Preview]');
        console.log('┌─────────────────┐');
        console.log('│                 │');
        console.log('│   🎨 STICKER   │');
        console.log('│                 │');
        console.log('└─────────────────┘');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn('Client is already initialized');
            return;
        }
        
        console.log('🚀 Initializing WhatsApp client...');
        this.client.initialize();
    }

    public async sendSticker(to: string, stickerPath: string): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('Client not initialized. Call initialize() first.');
        }
        
        const media = MessageMedia.fromFilePath(stickerPath);
        const chat = await this.client.getChatById(to);
        await chat.sendMessage(media, { sendMediaAsSticker: true });
    }

    public async sendMessage(to: string, message: string): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('Client not initialized. Call initialize() first.');
        }
        
        const chat = await this.client.getChatById(to);
        await chat.sendMessage(message);
    }

    public async getContactInfo(contactId: string) {
        if (!this.isInitialized) {
            throw new Error('Client not initialized. Call initialize() first.');
        }
        
        try {
            const contact = await this.client.getContactById(contactId);
            return {
                number: contact.number,
                name: contact.name,
                pushname: contact.pushname,
                isMe: contact.isMe,
                isUser: contact.isUser
            };
        } catch (error) {
            console.error('Error getting contact info:', error);
            return null;
        }
    }

    public async getChats() {
        if (!this.isInitialized) {
            throw new Error('Client not initialized. Call initialize() first.');
        }
        
        return await this.client.getChats();
    }

    public async logout(): Promise<void> {
        if (!this.isInitialized) {
            return;
        }
        
        await this.client.logout();
        this.isInitialized = false;
    }

    public async destroy(): Promise<void> {
        if (this.client) {
            await this.client.destroy();
            this.isInitialized = false;
        }
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public getRawClient(): Client {
        return this.client;
    }
}

export function createWhatsAppClient(config?: WhatsAppClientConfig): WhatsAppClient {
    return new WhatsAppClient(config);
}
