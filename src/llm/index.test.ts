import { getLLMClient } from './index';
import { getDeepSeekClient } from './deepseek';

jest.mock('./deepseek', () => ({
  getDeepSeekClient: jest.fn().mockReturnValue({ provider: 'deepseek' }),
}));

describe('getLLMClient', () => {
  it('returns deepseek client', () => {
    const client = getLLMClient();
    expect(client).toEqual({ provider: 'deepseek' });
    expect(getDeepSeekClient).toHaveBeenCalledTimes(1);
  });
});
