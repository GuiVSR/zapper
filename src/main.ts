import { createApp } from './server';
import { LocalDatabase } from './db/localDb';
import { WhatsAppClient } from './sync/whatsappClient';
import { SyncEngine } from './sync/syncEngine';
import { MessageProcessor } from './messaging/messageProcessor';
import { getLLMClient } from './llm';
import path from 'path';

const PORT = process.env.PORT || 3000;
const dbDir = path.join(process.cwd(), 'tmp', 'db');
const db = new LocalDatabase(dbDir);

let syncEngine: SyncEngine | undefined;

if (process.env.WHATSAPP_ENABLED === 'true') {
    const whatsappClient = new WhatsAppClient();
    const llmClient = getLLMClient();
    const processor = new MessageProcessor(db, llmClient);
    syncEngine = new SyncEngine(db, whatsappClient, processor);

    whatsappClient.connect().then(() => {
        console.log('[Zapper] WhatsApp client connected and ready');
    }).catch((err: any) => {
        console.error('[Zapper] WhatsApp client failed to connect:', err.message);
    });
}

const app = createApp(db, dbDir, syncEngine);

app.listen(PORT, () => {
    console.log(`[Zapper] API server running on http://localhost:${PORT}`);
    console.log(`[Zapper] DB path: ${dbDir}`);
    if (syncEngine) {
        console.log('[Zapper] WhatsApp sync enabled');
    }
});
