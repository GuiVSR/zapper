import { buildConversationText, parsePartsResponse } from './utils';

describe('llm/utils', () => {
  describe('buildConversationText', () => {
    it('formats normal messages', () => {
      const messages = [
        { body: 'Hello', fromMe: false, timestamp: 1000 },
        { body: 'Hi there', fromMe: true, timestamp: 2000 },
      ];
      expect(buildConversationText(messages)).toBe('[Customer] Hello\n[You] Hi there');
    });

    it('formats audio and ptt messages with transcription descriptions', () => {
      const messages = [
        { body: '', fromMe: false, timestamp: 1000, type: 'audio', imageDescription: 'Transcription text' },
        { body: '', fromMe: true, timestamp: 2000, type: 'ptt', imageDescription: 'Voice transcript' },
      ];
      expect(buildConversationText(messages)).toBe(
        '[Customer] [sent an audio message]\n[Transcription: Transcription text]\n[You] [sent a voice message]\n[Transcription: Voice transcript]'
      );
    });

    it('formats audio/ptt messages with body if no imageDescription', () => {
      const messages = [
        { body: 'Body transcription', fromMe: false, timestamp: 1000, type: 'audio' },
      ];
      expect(buildConversationText(messages)).toBe('[Customer] Body transcription');
    });

    it('formats audio/ptt messages with fallback message if no description and no body', () => {
      const messages = [
        { body: '', fromMe: false, timestamp: 1000, type: 'ptt' },
        { body: '', fromMe: true, timestamp: 2000, type: 'audio' },
      ];
      expect(buildConversationText(messages)).toBe(
        '[Customer] [sent a voice message — not transcribed]\n[You] [sent an audio message — not transcribed]'
      );
    });

    it('formats image messages with caption and description', () => {
      const messages = [
        { body: 'My Caption', fromMe: false, timestamp: 1000, type: 'image', imageDescription: 'Image desc' },
        { body: '[image]', fromMe: false, timestamp: 2000, type: 'image', imageDescription: 'Image desc 2' },
      ];
      expect(buildConversationText(messages)).toBe(
        '[Customer] [sent an image with caption: "My Caption"]\n[Image description: Image desc]\n[Customer] [sent an image]\n[Image description: Image desc 2]'
      );
    });

    it('falls back to body for images with no description', () => {
      const messages = [
        { body: 'Just a picture', fromMe: false, timestamp: 1000, type: 'image' },
      ];
      expect(buildConversationText(messages)).toBe('[Customer] Just a picture');
    });
  });

  describe('parsePartsResponse', () => {
    it('parses array format successfully', () => {
      const raw = '["part 1", "part 2"]';
      expect(parsePartsResponse(raw)).toEqual(['part 1', 'part 2']);
    });

    it('parses markdown json block format successfully', () => {
      const raw = '```json\n["part 1", "part 2"]\n```';
      expect(parsePartsResponse(raw)).toEqual(['part 1', 'part 2']);
    });

    it('parses markdown generic block format successfully', () => {
      const raw = '```\n["part 1", "part 2"]\n```';
      expect(parsePartsResponse(raw)).toEqual(['part 1', 'part 2']);
    });

    it('parses parsed-as-string nested format', () => {
      const raw = '"[\\"part 1\\", \\"part 2\\"]"';
      expect(parsePartsResponse(raw)).toEqual(['part 1', 'part 2']);
    });

    it('extracts brackets from surrounding text', () => {
      const raw = 'Here is the draft:\n["part 1", "part 2"]\nHope you like it.';
      expect(parsePartsResponse(raw)).toEqual(['part 1', 'part 2']);
    });

    it('splits by newlines when not valid JSON and maxParts > 1', () => {
      const raw = 'Part 1 content\n\nPart 2 content\n\nPart 3 content';
      expect(parsePartsResponse(raw, 2)).toEqual(['Part 1 content', 'Part 2 content']);
    });

    it('does not split by newlines if maxParts is 1', () => {
      const raw = 'Part 1 content\n\nPart 2 content';
      expect(parsePartsResponse(raw, 1)).toEqual(['Part 1 content\n\nPart 2 content']);
    });

    it('returns raw text as single part when parsing fail and no paragraph split', () => {
      const raw = 'Some random text without newlines';
      expect(parsePartsResponse(raw, 3)).toEqual(['Some random text without newlines']);
    });

    it('handles bracket with invalid JSON inside (falls through)', () => {
      const raw = 'Text with [invalid json array] brackets';
      expect(parsePartsResponse(raw, 3)).toEqual(['Text with [invalid json array] brackets']);
    });

    it('ignores invalid json objects or array containing non-strings', () => {
      const rawObj = '{"a": 1}';
      expect(parsePartsResponse(rawObj, 1)).toEqual(['{"a": 1}']);

      const rawInvalidArr = '[1, 2, 3]';
      expect(parsePartsResponse(rawInvalidArr, 1)).toEqual(['[1, 2, 3]']);
    });

    it('filters out empty/whitespace parts', () => {
      const raw = '["part 1", " ", "part 2"]';
      expect(parsePartsResponse(raw)).toEqual(['part 1', 'part 2']);
    });

    it('falls back to raw text if json array resolves to empty', () => {
      const raw = '[" ", "   "]';
      expect(parsePartsResponse(raw, 3)).toEqual(['[" ", "   "]']);
    });
  });
});
