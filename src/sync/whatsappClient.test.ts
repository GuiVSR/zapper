import { WhatsAppClient } from './whatsappClient';
import * as baileys from '@whiskeysockets/baileys';

// Mock Baileys
const mockSocket = {
    ev: {
        on: jest.fn(),
        emit: jest.fn(),
    },
    logout: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@whiskeysockets/baileys', () => ({
    makeWASocket: jest.fn().mockImplementation(() => mockSocket),
    useMultiFileAuthState: jest.fn().mockResolvedValue({
        state: {},
        saveCreds: jest.fn().mockResolvedValue(undefined),
    }),
    DisconnectReason: { loggedOut: 0 },
    makeInMemoryStore: jest.fn().mockReturnValue({
        readFromFile: jest.fn(),
        writeToFile: jest.fn(),
        bind: jest.fn(),
        chats: { all: jest.fn().mockReturnValue([]) },
        allChats: jest.fn().mockReturnValue([]),
        loadMessages: jest.fn().mockReturnValue([]),
    }),
}));

jest.mock('pino', () => jest.fn().mockReturnValue({ level: 'silent' }));

describe('WhatsAppClient', () => {
    let client: WhatsAppClient;

    beforeEach(() => {
        jest.clearAllMocks();
        client = new WhatsAppClient();
    });

    afterEach(async () => {
        await client.destroy();
    });

    describe('connect', () => {
        it('initializes Baileys socket', async () => {
            await client.connect();
            expect(baileys.makeWASocket).toHaveBeenCalled();
        });
    });

    describe('isReady', () => {
        it('returns false before connect', () => {
            expect(client.isReady()).toBe(false);
        });
    });
});
