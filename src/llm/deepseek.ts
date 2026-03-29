import axios, { AxiosInstance } from 'axios';

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface DeepSeekResponse {
  id: string;
  choices: Array<{
    message: DeepSeekMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class DeepSeekClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://api.deepseek.com',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  // Main function that receives chat history and returns text
  async getResponseFromHistory(
    chatHistory: DeepSeekMessage[],
    options?: {
      temperature?: number;
      max_tokens?: number;
      model?: string;
    }
  ): Promise<string> {
    const payload: DeepSeekRequest = {
      model: options?.model || 'deepseek-chat',
      messages: chatHistory,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 500,
    };

    try {
      const response = await this.client.post<DeepSeekResponse>(
        '/chat/completions',
        payload
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const errorData = error.response?.data as any;
        
        if (statusCode === 401) {
          throw new Error('Invalid API key. Please check your DeepSeek API key.');
        } else if (statusCode === 429) {
          throw new Error('Rate limit exceeded. Please wait and try again.');
        } else {
          throw new Error(
            `DeepSeek API error: ${errorData?.error?.message || error.message}`
          );
        }
      }
      throw error;
    }
  }

  // Alternative: receives chat history as separate arrays for messages and system prompt
  async getResponseWithSystem(
    systemPrompt: string,
    userMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number;
      max_tokens?: number;
      model?: string;
    }
  ): Promise<string> {
    const messages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      ...userMessages
    ];

    return this.getResponseFromHistory(messages, options);
  }

  // Convenience method for simple queries
  async ask(question: string): Promise<string> {
    return this.getResponseFromHistory([
      {
        role: 'user',
        content: question,
      },
    ]);
  }

  // Method with system prompt
  async askWithContext(
    question: string,
    systemPrompt: string
  ): Promise<string> {
    return this.getResponseFromHistory([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ]);
  }

  // Method specifically for WhatsApp-style conversations
  async getWhatsAppResponse(
    conversationHistory: Array<{ sender: string; message: string }>,
    systemPrompt?: string,
    options?: {
      temperature?: number;
      max_tokens?: number;
      model?: string;
    }
  ): Promise<string> {
    const messages: DeepSeekMessage[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Convert WhatsApp conversation to DeepSeek message format
    for (const entry of conversationHistory) {
      const role = entry.sender.toLowerCase() === 'assistant' ? 'assistant' : 'user';
      messages.push({
        role,
        content: entry.message,
      });
    }

    return this.getResponseFromHistory(messages, options);
  }
}

export default DeepSeekClient;