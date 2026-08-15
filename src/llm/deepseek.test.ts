import { DeepSeekClient, getDeepSeekClient } from './deepseek';
import { DEEPSEEK_BASE_URL } from '../constants';

describe('DeepSeekClient', () => {
  let fetchSpy: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    // Reset singleton instance between tests
    const deepseekModule = require('./deepseek');
    // Using reflection to reset internal singleton if needed
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('throws error if API key is missing', () => {
      expect(() => new DeepSeekClient('')).toThrow('DeepSeek API key is required.');
    });

    it('sets default model if none provided', () => {
      const client = new DeepSeekClient('test-key');
      expect((client as any).model).toBe('deepseek-chat');
    });
  });

  describe('getResponseMethods', () => {
    it('returns answer on ask', async () => {
      const client = new DeepSeekClient('test-key');
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'hello back' }, finish_reason: 'stop' }]
      };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const res = await client.ask('hello');
      expect(res).toBe('hello back');
      expect(fetchSpy).toHaveBeenCalledWith(`${DEEPSEEK_BASE_URL}/chat/completions`, expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-key',
          'Content-Type': 'application/json',
        },
      }));
    });

    it('returns answer on getResponseFromHistory', async () => {
      const client = new DeepSeekClient('test-key');
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'history response' }, finish_reason: 'stop' }]
      };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const res = await client.getResponseFromHistory([
        { role: 'user', content: 'hi' }
      ], { temperature: 0.5, max_tokens: 100 });
      expect(res).toBe('history response');
    });

    it('returns answer on getResponseWithSystem', async () => {
      const client = new DeepSeekClient('test-key');
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'system response' }, finish_reason: 'stop' }]
      };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const res = await client.getResponseWithSystem('system prompt', [{ role: 'user', content: 'hi' }]);
      expect(res).toBe('system response');
    });

    it('throws invalid key error on 401 status code', async () => {
      const client = new DeepSeekClient('test-key');
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } }),
      });

      await expect(client.ask('hello')).rejects.toThrow('Invalid DeepSeek API key: Unauthorized');
    });

    it('throws rate limit error on 429 status code', async () => {
      const client = new DeepSeekClient('test-key');
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Too many requests' } }),
      });

      await expect(client.ask('hello')).rejects.toThrow('DeepSeek rate limit exceeded: Too many requests');
    });

    it('throws general API error on other non-ok status codes', async () => {
      const client = new DeepSeekClient('test-key');
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal Server Error' } }),
      });

      await expect(client.ask('hello')).rejects.toThrow('DeepSeek API error: Internal Server Error');
    });

    it('throws general API error with status fallback if message not present', async () => {
      const client = new DeepSeekClient('test-key');
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(client.ask('hello')).rejects.toThrow('DeepSeek API error: HTTP 500');
    });

    it('throws error if response is empty', async () => {
      const client = new DeepSeekClient('test-key');
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] }),
      });

      await expect(client.ask('hello')).rejects.toThrow('DeepSeek returned an empty response.');
    });
  });

  describe('analyzeImage', () => {
    it('returns vision not supported message', async () => {
      const client = new DeepSeekClient('test-key');
      const res = await client.analyzeImage('base64', 'image/png');
      expect(res).toContain('vision analysis not supported');
    });
  });

  describe('generateWhatsAppDraft', () => {
    it('calls post with structured message log and parses output', async () => {
      const client = new DeepSeekClient('test-key');
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: '["Hello! How can I help you today?"]' } }]
      };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const res = await client.generateWhatsAppDraft([
        { body: 'Hello', fromMe: false, timestamp: 1000 }
      ], 1);

      expect(res).toEqual(['Hello! How can I help you today?']);
    });

    it('honors environment configuration for tokens, temp, and model', async () => {
      const client = new DeepSeekClient('test-key');
      process.env.DEEPSEEK_MODEL = 'deepseek-reasoner';
      process.env.DEEPSEEK_MAX_TOKENS = '123';
      process.env.DEEPSEEK_TEMPERATURE = '0.9';

      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: '["Reply"]' } }]
      };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.generateWhatsAppDraft([
        { body: 'Hello', fromMe: false, timestamp: 1000 }
      ], 1);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"model":"deepseek-reasoner"'),
        })
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"max_tokens":123'),
        })
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"temperature":0.9'),
        })
      );
    });
  });

  describe('getDeepSeekClient', () => {
    it('throws error if DEEPSEEK_API_KEY is missing in env', () => {
      delete process.env.DEEPSEEK_API_KEY;
      expect(() => getDeepSeekClient()).toThrow('DEEPSEEK_API_KEY is not set in your .env file.');
    });

    it('returns singleton instance when DEEPSEEK_API_KEY is set', () => {
      process.env.DEEPSEEK_API_KEY = 'singleton-key';
      process.env.DEEPSEEK_MODEL = 'custom-model';

      const client1 = getDeepSeekClient();
      const client2 = getDeepSeekClient();

      expect(client1).toBeInstanceOf(DeepSeekClient);
      expect(client1).toBe(client2);
    });
  });
});
