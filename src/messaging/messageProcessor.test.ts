import { MessageProcessor, IncomingMessageInput } from './messageProcessor';
import { LocalDatabase, Message } from '../db/localDb';
import { LLMClient } from '../llm';
import { transcribeAudio } from '../transcription/deepgram';

jest.mock('../transcription/deepgram', () => ({
  transcribeAudio: jest.fn(),
}));

describe('MessageProcessor', () => {
  let mockDb: jest.Mocked<LocalDatabase>;
  let mockLlmClient: jest.Mocked<LLMClient>;
  let processor: MessageProcessor;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockDb = {
      dbDir: 'fake-dir',
      getFilePath: jest.fn(),
      ensureDir: jest.fn(),
      getConversation: jest.fn(),
      saveConversation: jest.fn(),
      addMessage: jest.fn(),
      updateMessage: jest.fn(),
    } as unknown as jest.Mocked<LocalDatabase>;

    mockLlmClient = {
      generateWhatsAppDraft: jest.fn(),
      analyzeImage: jest.fn(),
    } as unknown as jest.Mocked<LLMClient>;

    processor = new MessageProcessor(mockDb, mockLlmClient);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('processes and stores text messages without media', async () => {
    const input: IncomingMessageInput = {
      id: 'msg1',
      chatId: 'chat123',
      timestamp: 1000,
      body: 'hello world',
      type: 'text',
      senderType: 'customer',
    };

    const res = await processor.processIncomingMessage(input);

    expect(res).toEqual({
      id: 'msg1',
      timestamp: 1000,
      body: 'hello world',
      message: 'hello world',
      type: 'text',
      senderType: 'customer',
      transcription: undefined,
      description: undefined,
    });
    expect(mockDb.addMessage).toHaveBeenCalledWith('chat123', res);
  });

  it('processes and transcribes audio/ptt messages with media', async () => {
    const input: IncomingMessageInput = {
      id: 'msg2',
      chatId: 'chat123',
      timestamp: 2000,
      body: '',
      type: 'audio',
      senderType: 'customer',
      media: {
        data: Buffer.from('audio-data').toString('base64'),
        mimetype: 'audio/ogg',
      },
    };

    (transcribeAudio as jest.Mock).mockResolvedValueOnce('transcribed audio text');

    const res = await processor.processIncomingMessage(input);

    expect(res.transcription).toBe('transcribed audio text');
    expect(res.body).toBe('transcribed audio text');
    expect(res.message).toBe('transcribed audio text');
    expect(transcribeAudio).toHaveBeenCalledWith(Buffer.from('audio-data'), 'audio/ogg');
    expect(mockDb.addMessage).toHaveBeenCalledWith('chat123', res);
  });

  it('handles empty transcript returning fallback string', async () => {
    const input: IncomingMessageInput = {
      id: 'msg3',
      chatId: 'chat123',
      timestamp: 3000,
      body: '',
      type: 'ptt',
      senderType: 'customer',
      media: {
        data: Buffer.from('audio-data').toString('base64'),
        mimetype: 'audio/ogg',
      },
    };

    (transcribeAudio as jest.Mock).mockResolvedValueOnce(null);

    const res = await processor.processIncomingMessage(input);
    expect(res.transcription).toBe('[Audio could not be transcribed]');
  });

  it('handles deepgram error returning error fallback string and logging', async () => {
    const input: IncomingMessageInput = {
      id: 'msg4',
      chatId: 'chat123',
      timestamp: 4000,
      body: '',
      type: 'audio',
      senderType: 'customer',
      media: {
        data: Buffer.from('audio-data').toString('base64'),
        mimetype: 'audio/ogg',
      },
    };

    (transcribeAudio as jest.Mock).mockRejectedValueOnce('Deepgram timeout');

    const res = await processor.processIncomingMessage(input);
    expect(res.transcription).toBe('[Audio transcription failed]');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Transcription failed: Deepgram timeout'));
  });

  it('processes and describes image/sticker/gif messages with media', async () => {
    const inputImage: IncomingMessageInput = {
      id: 'msg5',
      chatId: 'chat123',
      timestamp: 5000,
      body: 'optional caption',
      type: 'image',
      senderType: 'customer',
      media: {
        data: Buffer.from('image-data').toString('base64'),
        mimetype: 'image/png',
      },
    };

    mockLlmClient.analyzeImage.mockResolvedValueOnce('described image content');

    const resImage = await processor.processIncomingMessage(inputImage);
    expect(resImage.description).toBe('described image content');

    const inputGif: IncomingMessageInput = {
      id: 'msg5-gif',
      chatId: 'chat123',
      timestamp: 5100,
      body: '',
      type: 'gif',
      senderType: 'customer',
      media: {
        data: Buffer.from('gif-data').toString('base64'),
        mimetype: 'image/gif',
      },
    };

    mockLlmClient.analyzeImage.mockResolvedValueOnce('described gif');
    const resGif = await processor.processIncomingMessage(inputGif);
    expect(resGif.description).toBe('described gif');
  });

  it('ignores media for unsupported types', async () => {
    const input: IncomingMessageInput = {
      id: 'msg-doc',
      chatId: 'chat123',
      timestamp: 7000,
      body: 'document.pdf',
      type: 'document',
      senderType: 'customer',
      media: {
        data: Buffer.from('doc-data').toString('base64'),
        mimetype: 'application/pdf',
      },
    };

    const res = await processor.processIncomingMessage(input);
    expect(res.transcription).toBeUndefined();
    expect(res.description).toBeUndefined();
    expect(res.body).toBe('document.pdf');
  });

  it('handles image analysis error returning error fallback string and logging', async () => {
    const input: IncomingMessageInput = {
      id: 'msg6',
      chatId: 'chat123',
      timestamp: 6000,
      body: '',
      type: 'sticker',
      senderType: 'customer',
      media: {
        data: Buffer.from('sticker-data').toString('base64'),
        mimetype: 'image/webp',
      },
    };

    mockLlmClient.analyzeImage.mockRejectedValueOnce('Vision endpoint down');

    const res = await processor.processIncomingMessage(input);
    expect(res.description).toBe('[Image analysis failed]');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Image analysis failed: Vision endpoint down'));
  });
});
