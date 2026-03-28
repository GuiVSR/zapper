import { Message, MessageMedia } from 'whatsapp-web.js';
import { WhatsAppClient } from '../client';
import chalk from 'chalk';

export class MessageHandler {
    private client: WhatsAppClient;
    private webhookUrl?: string;

    constructor(client: WhatsAppClient, webhookUrl?: string) {
        this.client = client;
        this.webhookUrl = webhookUrl;
    }

    public async handleMessage(message: Message): Promise<void> {
        // Get contact info for better display
        let contactName = 'Unknown';
        try {
            const contact = await message.getContact();
            contactName = contact.pushname || contact.name || contact.number || message.from;
        } catch (error) {
            contactName = message.from;
        }

        // Format timestamp
        const timestamp = new Date().toLocaleString();
        
        // Determine message type and format output
        const isFromMe = message.fromMe;
        const sender = isFromMe ? '📤 You' : `📥 ${contactName}`;
        
        // Clear and colorful console output
        console.log('\n' + '═'.repeat(60));
        console.log(chalk.cyan(`[${timestamp}]`));
        console.log(chalk.yellow(`${sender}`));
        console.log(chalk.green(`From: ${message.from}`));
        console.log(chalk.gray(`ID: ${message.id.id}`));
        
        // Handle different message types
        switch(message.type) {
            case 'chat':
                console.log(chalk.white(`💬 Message: ${message.body}`));
                break;
                
            case 'image':
                console.log(chalk.magenta(`🖼️ Image received`));
                // Caption is accessed from the message body for media messages
                if (message.body) {
                    console.log(chalk.white(`Caption: ${message.body}`));
                }
                break;
                
            case 'video':
                console.log(chalk.magenta(`🎥 Video received`));
                if (message.body) {
                    console.log(chalk.white(`Caption: ${message.body}`));
                }
                break;
                
            case 'audio':
                console.log(chalk.magenta(`🎵 Audio received`));
                break;
                
            case 'document':
                console.log(chalk.magenta(`📄 Document received`));
                if (message.body) {
                    console.log(chalk.white(`Caption: ${message.body}`));
                }
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
        
        // Show media info if available
        if (message.hasMedia) {
            console.log(chalk.gray(`📎 Has media attachment`));
            
            // You can optionally download media info
            try {
                const media = await message.downloadMedia();
                if (media) {
                    console.log(chalk.gray(`   MIME type: ${media.mimetype}`));
                    console.log(chalk.gray(`   Size: ${(media.data.length / 1024).toFixed(2)} KB`));
                }
            } catch (error) {
                console.log(chalk.gray(`   Could not get media info`));
            }
        }
        
        console.log('═'.repeat(60) + '\n');

        // Skip command processing if it's a command
        if (message.body && message.body.startsWith('/')) {
            await this.handleCommand(message);
            return;
        }

        // Send to webhook if configured
        if (this.webhookUrl && !isFromMe) {
            await this.sendToWebhook(message);
        }
    }

    private async handleCommand(message: Message): Promise<void> {
        const [command, ...args] = message.body.slice(1).split(' ');
        
        switch(command.toLowerCase()) {
            case 'ping':
                console.log(chalk.blue('🏓 Sending pong...'));
                await this.client.sendMessage(message.from, 'pong');
                break;
                
            case 'help':
                const helpMessage = `
Available commands:
/ping - Check if bot is alive
/help - Show this help
/status - Show bot status
/chats - List recent chats
                `;
                await this.client.sendMessage(message.from, helpMessage);
                break;
                
            case 'status':
                const status = this.client.isReady();
                await this.client.sendMessage(
                    message.from,
                    `Bot Status: ${status ? '✅ Connected' : '❌ Disconnected'}`
                );
                break;
                
            case 'chats':
                const chats = await this.client.getChats();
                const recentChats = chats.slice(0, 5).map(chat => 
                    `- ${chat.name || chat.id.user}: ${chat.lastMessage?.body || 'No messages'}`
                ).join('\n');
                await this.client.sendMessage(
                    message.from,
                    `Recent chats:\n${recentChats}`
                );
                break;
                
            default:
                await this.client.sendMessage(message.from, 'Unknown command. Type /help for available commands.');
        }
    }

    private async sendToWebhook(message: Message): Promise<void> {
        try {
            // Get contact info for webhook
            let contactInfo = null;
            try {
                const contact = await message.getContact();
                contactInfo = {
                    number: contact.number,
                    name: contact.name,
                    pushname: contact.pushname
                };
            } catch (error) {
                // Ignore contact fetch errors
            }
            
            const payload = {
                id: message.id.id,
                from: message.from,
                to: message.to,
                body: message.body,
                timestamp: message.timestamp,
                type: message.type,
                hasMedia: message.hasMedia,
                fromMe: message.fromMe,
                contact: contactInfo,
                deviceType: message.deviceType,
                isForwarded: message.isForwarded,
                isStatus: message.isStatus
            };

            const response = await fetch(this.webhookUrl!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                console.error(`Webhook failed with status: ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to send webhook:', error);
        }
    }
}