import { transcribeAudio } from './deepgram';
import { DEEPGRAM_BASE_URL } from '../constants';

describe('transcribeAudio', () => {
  let fetchSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    fetchSpy = jest.spyOn(global, 'fetch');
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null if DEEPGRAM_API_KEY is not set', async () => {
    delete process.env.DEEPGRAM_API_KEY;
    const res = await transcribeAudio(Buffer.from('audio'), 'audio/ogg');
    expect(res).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEEPGRAM_API_KEY not set'));
  });

  it('transcribes audio buffer successfully', async () => {
    process.env.DEEPGRAM_API_KEY = 'test-key';
    const mockResponse = {
      results: {
        channels: [
          {
            alternatives: [
              { transcript: 'hello world from deepgram', confidence: 0.99 },
            ],
          },
        ],
      },
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const buffer = Buffer.from('fake-audio');
    const res = await transcribeAudio(buffer, 'audio/ogg; codecs=opus');

    expect(res).toBe('hello world from deepgram');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(DEEPGRAM_BASE_URL),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Token test-key',
          'Content-Type': 'audio/ogg',
        },
      })
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✓ "hello world from deepgram"'));
  });

  it('returns null and logs error if response is not ok', async () => {
    process.env.DEEPGRAM_API_KEY = 'test-key';
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad request data',
    });

    const res = await transcribeAudio(Buffer.from('audio'), 'audio/ogg');
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Deepgram returned 400: Bad request data'));
  });

  it('returns null and logs warning if transcript is empty', async () => {
    process.env.DEEPGRAM_API_KEY = 'test-key';
    const mockResponse = {
      results: {
        channels: [
          {
            alternatives: [],
          },
        ],
      },
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const res = await transcribeAudio(Buffer.from('audio'), 'audio/ogg');
    expect(res).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Deepgram returned empty transcript'));
  });

  it('truncates success log when transcript is long', async () => {
    process.env.DEEPGRAM_API_KEY = 'test-key';
    const longTranscript = 'a'.repeat(100);
    const mockResponse = {
      results: {
        channels: [
          {
            alternatives: [
              { transcript: longTranscript },
            ],
          },
        ],
      },
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const res = await transcribeAudio(Buffer.from('audio'), 'audio/ogg');
    expect(res).toBe(longTranscript);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✓ "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…"'));
  });
});
