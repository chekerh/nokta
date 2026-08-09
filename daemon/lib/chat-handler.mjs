import { compileContext } from '../../compiler/lib/nokta.mjs';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const CONCISENESS_PROMPTS = {
  verbose: '',
  concise: `You respond concisely. Short sentences. No pleasantries.
No "I'd be happy to help". No "Based on my analysis".
State facts. Give code. Stop.
If unsure, say "not sure" and what you need.
User is technical. Assume context. Be direct.`,
  caveman: `Caveman speak only.
No greetings. No farewells. No explanations of what you will do.
Just do it. Short sentences. Subject-verb-object.
Code = give code. Bug = name bug. Fix = show fix.
If user asks "why", then explain. Otherwise stop.
Reason in silence. Output only result.`,
  ultra: `Telegraphic. No grammar. No articles.
Key words only. Code or data. Nothing else.
Output: code / diff / command / number.
/explain = optional. Default = silent.`,
};

export class ChatHandler {
  constructor(providerManager, options = {}) {
    this.providerManager = providerManager;
    this.projectRoot = options.projectRoot || process.cwd();
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.costTracker = options.costTracker || null;
    this.gateKeeper = options.gateKeeper || null;
    this.defaultSystemPrompt =
      options.systemPrompt ||
      `You are a senior software engineer working in a disciplined AI-assisted development environment.

Follow these principles:
1. Think before acting — analyze the problem, consider alternatives, then implement.
2. Write correct, maintainable, idiomatic code that fits the existing project patterns.
3. Verify your work — run tests, type checks, lint when relevant.
4. Document decisions, tradeoffs, and risks.
5. Be concise but complete in your responses.`;
  }

  async _buildCompiledContext(task) {
    try {
      const result = compileContext({
        target: this.projectRoot,
        task: task || 'general software engineering task',
        budget: '6000',
      });
      return result.markdown;
    } catch {
      return null;
    }
  }

  async _buildSystemPrompt(messages, contextPack, conciseness) {
    const parts = [this.defaultSystemPrompt];

    const mode = CONCISENESS_PROMPTS[conciseness];
    if (mode) {
      parts.push('\n\n## Output Style\n\n');
      parts.push(mode);
    }

    if (contextPack) {
      parts.push('\n\n## Active Project Context\n\n');
      parts.push(contextPack);
    }

    const trailPath = path.join(this.projectRoot, '.ai', 'trail', 'index.md');
    try {
      const trailContent = await fs.readFile(trailPath, 'utf8');
      parts.push('\n\n## Active Trail\n\n');
      parts.push(trailContent);
    } catch {}

    return parts.join('');
  }

  _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  _countMessagesTokens(messages) {
    let count = 0;
    for (const m of messages) {
      count += this._estimateTokens(m.content);
    }
    return count;
  }

  async handleChat(
    messages,
    { stream = false, task, _onToken, signal, conciseness, provider: explicitProvider, model: explicitModel } = {},
  ) {
    let provider;
    if (explicitProvider) {
      provider = this.providerManager.get(explicitProvider);
      if (!provider) {
        throw new Error(`Provider "${explicitProvider}" not found. Configure it first.`);
      }
    } else {
      provider = await this.providerManager.selectProvider(messages);
    }
    if (!provider) {
      throw new Error('No AI provider available. Configure a provider with an API key or start Ollama.');
    }

    if (this.gateKeeper) {
      const gateResult = await this.gateKeeper.evaluateAll(messages);
      if (!gateResult.passed) {
        const failed = gateResult.gates.filter((r) => r.status === 'fail');
        const errors = failed.map((r) => `${r.gate}: ${r.message}`).join('; ');
        throw new Error(`Gate check failed: ${errors}`);
      }
    }

    const contextPack = await this._buildCompiledContext(task);
    const systemPrompt = await this._buildSystemPrompt(messages, contextPack, conciseness);
    const providerMessages = provider.buildMessages(systemPrompt, messages);

    const tokensIn = this._estimateTokens(systemPrompt) + this._countMessagesTokens(messages);

    if (stream) {
      const response = await provider.chat(providerMessages, { stream: true, signal });
      const model = explicitModel || provider.models?.[0] || provider.id;
      return { response, provider: provider.id, model, tokensIn };
    }

    const result = await provider.chat(providerMessages, { signal });
    const tokensOut = this._estimateTokens(result.content);

    if (this.costTracker) {
      const model = result.model || provider.models?.[0] || provider.id;
      this.costTracker
        .record(model, tokensIn, tokensOut, {
          provider: provider.id,
          task: task || 'chat',
        })
        .catch(() => {});
    }

    return {
      content: result.content,
      finishReason: result.finishReason,
      tokensUsed: result.tokensUsed,
      model: result.model,
      provider: provider.id,
      tokensIn,
      tokensOut,
    };
  }
}
