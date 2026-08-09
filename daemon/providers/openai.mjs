import { Provider } from './base.mjs';

export class OpenAIProvider extends Provider {
  constructor(config = {}) {
    super({
      id: 'openai',
      name: 'OpenAI',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      models: config.models || ['gpt-4o', 'gpt-4o-mini'],
      ...config,
    });
  }

  async _request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      timeout: this.timeout,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenAI error ${response.status}: ${text || response.statusText}`);
    }
    return response;
  }

  async chat(messages, { stream = false, model, maxTokens, temperature, signal } = {}) {
    const body = {
      model: model || this.models[0],
      messages,
      max_tokens: maxTokens || this.maxTokens,
      temperature: temperature ?? this.temperature,
      stream,
    };

    if (stream) {
      const response = await this._request('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      });
      return response;
    }

    const response = await this._request('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      finishReason: data.choices?.[0]?.finish_reason || 'unknown',
      tokensUsed: data.usage?.total_tokens || 0,
      model: data.model,
    };
  }

  async complete(prompt, { context = [], model, maxTokens, temperature, signal } = {}) {
    const messages = [];
    if (context.length) {
      messages.push({ role: 'system', content: context.join('\n') });
    }
    messages.push({ role: 'user', content: prompt });

    const result = await this.chat(messages, { model, maxTokens, temperature, signal });
    return { completion: result.content };
  }

  async listModels() {
    try {
      const response = await this._request('/models', { method: 'GET' });
      const data = await response.json();
      return (data.data || [])
        .filter((m) => m.id.startsWith('gpt-'))
        .map((m) => m.id)
        .slice(0, 20);
    } catch {
      return this.models;
    }
  }

  async health() {
    try {
      await this._request('/models', { method: 'GET', timeout: 5000 });
      return { status: 'ok', provider: this.id };
    } catch (err) {
      return { status: 'error', provider: this.id, error: err.message };
    }
  }
}
