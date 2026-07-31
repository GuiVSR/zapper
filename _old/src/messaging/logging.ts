// ─────────────────────────────────────────────────────────────────────────────
// logging.ts — terminal pretty-printing for inbound/outbound messages.
// ─────────────────────────────────────────────────────────────────────────────

import { Message } from 'whatsapp-web.js';
import chalk from 'chalk';

/**
 * Pretty-prints an inbound/outbound message to the terminal.
 */
export function logMessage(message: Message, contactName: string): void {
    const timestamp = new Date().toLocaleString();
    const sender    = message.fromMe ? '📤 You' : `📥 ${contactName}`;

    console.log('\n' + '═'.repeat(60));
    console.log(chalk.cyan(`[${timestamp}]`));
    console.log(chalk.yellow(`${sender}`));
    console.log(chalk.green(`From: ${message.from}`));
    console.log(chalk.gray(`ID: ${message.id.id}`));
    console.log(chalk.gray(`Type: ${message.type}`));

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
        case 'ptt':
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

    console.log('═'.repeat(60) + '\n');
}