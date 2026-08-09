import { Provider } from './base.mjs';

export class OllamaProvider extends Provider {
  constructor(config = {}) {
    super({
      id: 'ollama',
      name: 'Ollama (Local)',
      baseUrl: config.baseUrl || 'http://localhost:11434',
      models: config.models || [],
      enabled: true,
      ...config,
    });
  }

  async _request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      timeout: this.timeout,
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ollama error ${response.status}: ${text || response.statusText}`);
    }
    return response;
  }

  async chat(messages, { stream = false, model, maxTokens, temperature, signal } = {}) {
    const body = {
      model: model || this.models[0] || 'llama3.2',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream,
      options: {
        num_predict: maxTokens || this.maxTokens,
        temperature: temperature ?? this.temperature,
      },
    };

    if (stream) {
      const response = await this._request('/api/chat', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      });
      return response;
    }

    const response = await this._request('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json();
    return {
      content: data.message?.content || '',
      finishReason: data.done ? 'stop' : 'unknown',
      tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      model: data.model,
    };
  }

  async complete(prompt, { context = [], model, maxTokens, temperature, signal } = {}) {
    const body = {
      model: model || this.models[0] || 'llama3.2',
      prompt,
      context,
      options: {
        num_predict: maxTokens || this.maxTokens,
        temperature: temperature ?? this.temperature,
      },
    };
    const response = await this._request('/api/generate', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json();
    return { completion: data.response || '' };
  }

  async listModels() {
    try {
      const response = await this._request('/api/tags');
      const data = await response.json();
      this.models = (data.models || []).map((m) => m.name);
      return this.models;
    } catch {
      return [];
    }
  }

  async health() {
    try {
      await this._request('/api/tags', { method: 'GET', timeout: 2000 });
      return { status: 'ok', provider: this.id };
    } catch (err) {
      return { status: 'error', provider: this.id, error: err.message };
    }
  }
}
