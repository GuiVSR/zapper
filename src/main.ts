import { Message } from "whatsapp-web.js";
import { WhatsAppClient } from "./client";

// Create client instance with custom handlers
const client = new WhatsAppClient({
    headless: true, // Set to false if you want to see the browser
    onQR: () => {
        // Custom QR handling (or use default)
        console.log('QR Code generated - scan with WhatsApp');
        // You could also generate a file or use a different display method
    },
    onReady: () => {
        console.log('✅ WhatsApp client is ready!');
        console.log('Listening for messages...\n');
    },
    onMessage: (message: Message) => {
        // Print message details
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📨 New Message:`);
        console.log(`From: ${message.from}`);
        console.log(`Author: ${message.author || 'N/A'}`);
        console.log(`Time: ${new Date().toLocaleString()}`);
        console.log(`Type: ${message.type}`);
        console.log(`Content: ${message.body || '[No text content]'}`);
        
        if (message.hasMedia) {
            console.log(`📎 Media attached: ${message.type}`);
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    },
    onError: (error: any) => {
        console.error('Client error:', error);
    }
});

// Start the client
client.initialize().catch(console.error);