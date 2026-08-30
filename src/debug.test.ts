describe('debug', () => {
  let logSpy: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not log when DEBUG is false', () => {
    process.env.DEBUG = 'false';
    const { debugLog, debugPrompt, debugResponse, debugImageAnalysis } = require('./debug');

    debugLog('Section', 'Content');
    debugPrompt('Groq', 'model', 'system', 'convo', 3);
    debugResponse('Groq', 'raw', ['part']);
    debugImageAnalysis('Groq', 'model', 'msg123', 'image/png', 'prompt', 'desc');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs when DEBUG is true', () => {
    process.env.DEBUG = 'true';
    const { debugLog, debugPrompt, debugResponse, debugImageAnalysis } = require('./debug');

    debugLog('Section', 'Content');
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockClear();

    debugPrompt('Groq', 'model', 'system\nline2', 'convo\nline2', 3);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockClear();

    debugResponse('Groq', 'raw\nline2', ['part\nline2']);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockClear();

    debugImageAnalysis('Groq', 'model', 'msg123', 'image/png', 'prompt\nline2', 'desc\nline2');
    expect(logSpy).toHaveBeenCalled();
  });
});
