export class Provider {
  constructor(config = {}) {
    this.id = config.id;
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.models = config.models || [];
    this.enabled = config.enabled !== false;
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature ?? 0.7;
    this.timeout = config.timeout || 60000;
    this.retryCount = config.retryCount || 2;

    this._validateContract();
  }

  static REQUIRED_METHODS = ['chat', 'complete', 'listModels', 'health'];

  _validateContract() {
    for (const method of Provider.REQUIRED_METHODS) {
      if (this[method] === Provider.prototype[method]) {
        throw new Error(
          `Provider "${this.id}" must implement ${method}(). ` +
            'All provider subclasses must override the 4 core methods: chat, complete, listModels, health.',
        );
      }
    }
  }

  async chat(
    _messages,
    { stream: _stream = false, model: _model, maxTokens: _maxTokens, temperature: _temperature, signal: _signal } = {},
  ) {
    throw new Error('Provider must implement chat()');
  }

  async complete(
    _prompt,
    { context: _context = [], model: _model, maxTokens: _maxTokens, temperature: _temperature, signal: _signal } = {},
  ) {
    throw new Error('Provider must implement complete()');
  }

  async listModels() {
    throw new Error('Provider must implement listModels()');
  }

  async health() {
    throw new Error('Provider must implement health()');
  }

  buildMessages(systemPrompt, messages) {
    const result = [];
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }
    for (const msg of messages) {
      result.push({ role: msg.role, content: msg.content });
    }
    return result;
  }

  classifyComplexity(messages) {
    const text = messages
      .map((m) => m.content)
      .join(' ')
      .toLowerCase();
    const complexityPatterns = {
      high: [/architecture|refactor|redesign|migration|scalab|distribut|consisten|transact|deadlock|concurr/],
      medium: [/implement|feature|endpoint|service|component|integration|pipeline|workflow|orchestrat/],
    };
    if (text.length > 4000) return 'high';
    for (const pattern of complexityPatterns.high) {
      if (pattern.test(text)) return 'high';
    }
    for (const pattern of complexityPatterns.medium) {
      if (pattern.test(text)) return 'medium';
    }
    return 'low';
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      models: this.models,
      enabled: this.enabled,
      hasKey: Boolean(this.apiKey),
    };
  }
}
