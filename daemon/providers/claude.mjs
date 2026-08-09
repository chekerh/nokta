import { Provider } from './base.mjs';

export class ClaudeProvider extends Provider {
  constructor(config = {}) {
    super({
      id: 'claude',
      name: 'Anthropic Claude',
      baseUrl: config.baseUrl || 'https://api.anthropic.com/v1',
      models: config.models || ['claude-sonnet-4-20250514', 'claude-haiku-3-20250313'],
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
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        ...options.headers,
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Claude error ${response.status}: ${text || response.statusText}`);
    }
    return response;
  }

  async chat(messages, { stream = false, model, maxTokens, temperature, signal } = {}) {
    const body = {
      model: model || this.models[0],
      max_tokens: maxTokens || this.maxTokens,
      temperature: temperature ?? this.temperature,
      messages: messages.filter((m) => m.role !== 'system'),
      system: messages.find((m) => m.role === 'system')?.content,
      stream,
    };

    if (stream) {
      const response = await this._request('/messages', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      });
      return response;
    }

    const response = await this._request('/messages', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json();
    return {
      content: data.content?.[0]?.text || '',
      finishReason: data.stop_reason || 'unknown',
      tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      model: data.model,
    };
  }

  async complete(prompt, { context = [], model, maxTokens, temperature, signal } = {}) {
    const response = await this.chat([{ role: 'user', content: `${context.join('\n')}\n\n${prompt}` }], {
      model,
      maxTokens,
      temperature,
      signal,
    });
    return { completion: response.content };
  }

  async listModels() {
    return this.models;
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
