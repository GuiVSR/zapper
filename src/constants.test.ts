import {
  getMaxDraftParts,
  getSystemPrompt,
  API_BASE_URL,
  DEFAULT_MAX_DRAFT_PARTS,
  DEFAULT_SYSTEM_PROMPT,
} from './constants';

describe('constants', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getMaxDraftParts', () => {
    it('returns default when env is not set', () => {
      delete process.env.MAX_DRAFT_PARTS;
      expect(getMaxDraftParts()).toBe(DEFAULT_MAX_DRAFT_PARTS);
    });

    it('returns default when env is invalid', () => {
      process.env.MAX_DRAFT_PARTS = 'invalid';
      expect(getMaxDraftParts()).toBe(DEFAULT_MAX_DRAFT_PARTS);
    });

    it('returns default when env is less than 1', () => {
      process.env.MAX_DRAFT_PARTS = '0';
      expect(getMaxDraftParts()).toBe(DEFAULT_MAX_DRAFT_PARTS);
    });

    it('returns valid number when env is valid', () => {
      process.env.MAX_DRAFT_PARTS = '5';
      expect(getMaxDraftParts()).toBe(5);
    });
  });

  describe('getSystemPrompt', () => {
    it('returns default plain text prompt when maxParts is <= 1', () => {
      delete process.env.SYSTEM_PROMPT;
      const prompt = getSystemPrompt(1);
      expect(prompt).toContain(DEFAULT_SYSTEM_PROMPT);
      expect(prompt).toContain('plain text only');
    });

    it('returns default array prompt when maxParts is > 1', () => {
      delete process.env.SYSTEM_PROMPT;
      const prompt = getSystemPrompt(3);
      expect(prompt).toContain(DEFAULT_SYSTEM_PROMPT);
      expect(prompt).toContain('JSON array of strings');
      expect(prompt).toContain('at most 3 separate');
    });

    it('uses SYSTEM_PROMPT from environment if set', () => {
      process.env.SYSTEM_PROMPT = 'Custom Prompt';
      const prompt1 = getSystemPrompt(1);
      const prompt3 = getSystemPrompt(3);
      expect(prompt1).toContain('Custom Prompt');
      expect(prompt1).toContain('plain text only');
      expect(prompt3).toContain('Custom Prompt');
      expect(prompt3).toContain('at most 3 separate');
    });
  });

  describe('API_BASE_URL', () => {
    it('returns localhost when window is undefined', () => {
      jest.isolateModules(() => {
        const { API_BASE_URL } = require('./constants');
        expect(API_BASE_URL).toBe('http://127.0.0.1:3002');
      });
    });

    it('returns browser url when window is defined', () => {
      jest.isolateModules(() => {
        const mockWindow = {
          location: {
            protocol: 'https:',
            hostname: 'my-app.com',
          },
        };
        (global as any).window = mockWindow;

        const { API_BASE_URL } = require('./constants');
        expect(API_BASE_URL).toBe('https://my-app.com:3002');

        delete (global as any).window;
      });
    });
  });
});
