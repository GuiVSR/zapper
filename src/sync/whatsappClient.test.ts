import { WhatsAppClient } from './whatsappClient';

// Create fresh mocks per test — references are stable but state resets in beforeEach
const mockClientInstance = {
    on: jest.fn().mockReturnThis(),
    once: jest.fn().mockReturnThis(),
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    getChats: jest.fn().mockResolvedValue([]),
    getChatById: jest.fn(),
};

jest.mock('whatsapp-web.js', () => ({
    Client: jest.fn().mockImplementation(() => mockClientInstance),
    LocalAuth: jest.fn(),
}));

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
}));

describe('WhatsAppClient', () => {
    let client: WhatsAppClient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClientInstance.on.mockReturnThis();
        mockClientInstance.initialize.mockResolvedValue(undefined);
        mockClientInstance.destroy.mockResolvedValue(undefined);
        mockClientInstance.getChats.mockResolvedValue([]);
        mockClientInstance.getChatById.mockResolvedValue({
            fetchMessages: jest.fn().mockResolvedValue([]),
        });
        client = new WhatsAppClient();
    });

    afterEach(async () => {
        await client.destroy();
    });

    const connectAndReady = async () => {
        const connectPromise = client.connect();
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Find handlers from either on or once
        const allHandlers = [
            ...mockClientInstance.on.mock.calls,
            ...mockClientInstance.once.mock.calls
        ];
        const readyHandlers = allHandlers
            .filter((c: any[]) => c[0] === 'ready')
            .map((c: any[]) => c[1]);
            
        readyHandlers.forEach(h => h());
        await connectPromise;
    };

    describe('normalizeChatId', () => {
        it('returns ID unchanged when it already contains @', () => {
            const result = (client as any).normalizeChatId('5511999999999@c.us');
            expect(result).toBe('5511999999999@c.us');
        });

        it('strips non-digits and appends @c.us for raw phone numbers', () => {
            const result = (client as any).normalizeChatId('+55 (11) 99999-9999');
            expect(result).toBe('5511999999999@c.us');
        });

        it('handles group IDs with @g.us', () => {
            const result = (client as any).normalizeChatId('123456789@g.us');
            expect(result).toBe('123456789@g.us');
        });
    });

    describe('isReady', () => {
        it('returns false before connect', () => {
            expect(client.isReady()).toBe(false);
        });
    });

    describe('connect', () => {
        it('initializes WhatsApp client and becomes ready', async () => {
            await connectAndReady();
            expect(client.isReady()).toBe(true);
        });
    });

    describe('destroy', () => {
        it('calls destroy on internal client', async () => {
            await connectAndReady();

            await client.destroy();
            expect(mockClientInstance.destroy).toHaveBeenCalled();
            expect(client.isReady()).toBe(false);
        });
    });

    describe('fetchMessages', () => {
        it('throws when client not initialized', async () => {
            await expect(client.fetchMessages('5511999999999', 50)).rejects.toThrow(
                'WhatsApp client not initialized'
            );
        });

        it('fetches and maps messages to RawWhatsAppMessage', async () => {
            await connectAndReady();

            const mockChat = {
                fetchMessages: jest.fn().mockResolvedValue([
                    {
                        id: { _serialized: 'false_msg1@c.us' },
                        timestamp: 1700000000,
                        body: 'hello world',
                        type: 'chat',
                        fromMe: false,
                        hasMedia: false,
                        from: '5511999999999@c.us',
                        to: '5511888888888@c.us',
                    },
                ]),
            };
            mockClientInstance.getChatById.mockResolvedValue(mockChat);

            const messages = await client.fetchMessages('5511999999999', 50);

            expect(messages).toHaveLength(1);
            expect(messages[0]).toMatchObject({
                id: 'false_msg1@c.us',
                timestamp: 1700000000000,
                body: 'hello world',
                type: 'chat',
                fromMe: false,
                hasMedia: false,
            });
        });
    });

    describe('downloadMedia', () => {
        it('throws when client not initialized', async () => {
            await expect(
                client.downloadMedia('5511999999999', 'msg-id')
            ).rejects.toThrow('WhatsApp client not initialized');
        });

        it('returns null when message has no media', async () => {
            await connectAndReady();

            const mockChat = {
                fetchMessages: jest.fn().mockResolvedValue([
                    { id: { _serialized: 'target-msg' }, hasMedia: false },
                ]),
            };
            mockClientInstance.getChatById.mockResolvedValue(mockChat);

            const result = await client.downloadMedia('5511999999999', 'target-msg');
            expect(result).toBeNull();
        });

        it('downloads media for message with hasMedia=true', async () => {
            await connectAndReady();

            const mockMsg = {
                id: { _serialized: 'target-msg' },
                hasMedia: true,
                downloadMedia: jest.fn().mockResolvedValue({
                    mimetype: 'image/jpeg',
                    data: 'base64encoded',
                }),
            };
            const mockChat = { fetchMessages: jest.fn().mockResolvedValue([mockMsg]) };
            mockClientInstance.getChatById.mockResolvedValue(mockChat);

            const result = await client.downloadMedia('5511999999999', 'target-msg');

            expect(result).toEqual({
                mimetype: 'image/jpeg',
                data: 'base64encoded',
            });
        });
    });

    describe('getChats', () => {
        it('throws when client not initialized', async () => {
            await expect(client.getChats()).rejects.toThrow(
                'WhatsApp client not initialized'
            );
        });

        it('delegates to internal client when ready', async () => {
            await connectAndReady();

            mockClientInstance.getChats.mockResolvedValue([{ name: 'Test Chat' }]);
            const chats = await client.getChats();
            expect(chats).toEqual([{ name: 'Test Chat' }]);
        });
    });

    describe('event handlers', () => {
        it('sets ready to false on disconnected event', async () => {
            await connectAndReady();
            expect(client.isReady()).toBe(true);

            // Check both on and once
            const allCalls = [...mockClientInstance.on.mock.calls, ...mockClientInstance.once.mock.calls];
            const disconnectedHandler = allCalls.find(
                (c: any[]) => c[0] === 'disconnected'
            )?.[1];
            disconnectedHandler('logout');
            expect(client.isReady()).toBe(false);
        });

        it('handles QR event without qrcode-terminal installed', async () => {
            const connectPromise = client.connect();
            await new Promise(resolve => setTimeout(resolve, 0));
            // Do not resolve ready — just verify QR handler doesn't throw
            
            const allCalls = [...mockClientInstance.on.mock.calls, ...mockClientInstance.once.mock.calls];
            const qrHandler = allCalls.find(
                (c: any[]) => c[0] === 'qr'
            )?.[1];
            expect(() => qrHandler('fake-qr-data')).not.toThrow();

            // Resolve connect promise to prevent timeout
            const readyHandlers = allCalls
                .filter((c: any[]) => c[0] === 'ready')
                .map((c: any[]) => c[1]);
            readyHandlers.forEach(h => h());
            await connectPromise;
        });
    });
});
