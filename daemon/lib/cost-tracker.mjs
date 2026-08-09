import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { atomicWrite } from './atomic-write.mjs';
import { prepare } from '../db/connection.mjs';

const LEDGER_PATH = path.join(homedir(), '.nokta', 'cost-ledger.json');

const DEFAULT_PRICING = {
  'claude-sonnet-4-20250514': { input: 3, output: 15, provider: 'claude' },
  'claude-sonnet-4': { input: 3, output: 15, provider: 'claude' },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15, provider: 'claude' },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25, provider: 'claude' },
  'gpt-4o': { input: 2.5, output: 10, provider: 'openai' },
  'gpt-4o-mini': { input: 0.15, output: 0.6, provider: 'openai' },
  'gpt-4-turbo': { input: 10, output: 30, provider: 'openai' },
  'gemini-2.5-pro': { input: 1.25, output: 5, provider: 'google' },
  'gemini-2.5-flash': { input: 0.15, output: 0.6, provider: 'google' },
  'anthropic/claude-sonnet': { input: 3, output: 15, provider: 'openrouter' },
  'openai/gpt-4o': { input: 2.5, output: 10, provider: 'openrouter' },
  'meta-llama/llama-3.2-3b-instruct': { input: 0, output: 0, provider: 'local' },
  'llama3.2': { input: 0, output: 0, provider: 'local' },
  'llama3.1': { input: 0, output: 0, provider: 'local' },
  mistral: { input: 0, output: 0, provider: 'local' },
  codellama: { input: 0, output: 0, provider: 'local' },
};

function getDbPricing() {
  try {
    const rows = prepare('SELECT model, input, output, provider FROM model_pricing').all();
    const dbPricing = {};
    for (const row of rows) {
      dbPricing[row.model] = { input: row.input, output: row.output, provider: row.provider };
    }
    return dbPricing;
  } catch {
    return {};
  }
}

function getPricing(model) {
  const dbPricing = getDbPricing();
  return dbPricing[model] || DEFAULT_PRICING[model] || { input: 2.5, output: 10, provider: 'unknown' };
}

function estimateCost(model, inputTokens, outputTokens) {
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return { inputCost, outputCost, totalCost: inputCost + outputCost, pricing };
}

export class CostTracker {
  constructor() {
    this._ledger = null;
    this._dirty = false;
  }

  async _load() {
    if (this._ledger) return this._ledger;
    try {
      await fs.mkdir(path.dirname(LEDGER_PATH), { recursive: true });
      const data = await fs.readFile(LEDGER_PATH, 'utf8');
      this._ledger = JSON.parse(data);
    } catch {
      this._ledger = { entries: [], totalCost: 0, totalTokens: 0, lastReset: new Date().toISOString() };
    }
    return this._ledger;
  }

  async _save() {
    if (!this._dirty) return;
    try {
      await atomicWrite(LEDGER_PATH, this._ledger);
      this._dirty = false;
    } catch {}
  }

  async record(model, inputTokens, outputTokens, metadata = {}) {
    const ledger = await this._load();
    const { inputCost, outputCost, totalCost, pricing } = estimateCost(model, inputTokens, outputTokens);
    const entry = {
      timestamp: new Date().toISOString(),
      model,
      provider: pricing.provider,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost: Math.round(inputCost * 100) / 100,
      outputCost: Math.round(outputCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      exchangeRate: 1,
      ...metadata,
    };
    ledger.entries.push(entry);
    ledger.totalCost = Math.round((ledger.totalCost + totalCost) * 100) / 100;
    ledger.totalTokens += inputTokens + outputTokens;
    this._dirty = true;
    if (ledger.entries.length > 10000) {
      ledger.entries = ledger.entries.slice(-8000);
    }
    await this._save();
    return entry;
  }

  async getCosts(since, until) {
    const ledger = await this._load();
    const sinceDate = since ? new Date(since) : new Date(0);
    const untilDate = until ? new Date(until) : new Date(Date.now() + 86400000);
    return ledger.entries.filter((e) => {
      const d = new Date(e.timestamp);
      return d >= sinceDate && d <= untilDate;
    });
  }

  async getMonthlySpend() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const entries = await this.getCosts(startOfMonth.toISOString());
    const total = entries.reduce((sum, e) => sum + e.totalCost, 0);
    const byProvider = {};
    for (const e of entries) {
      byProvider[e.provider] = (byProvider[e.provider] || 0) + e.totalCost;
    }
    return {
      month: startOfMonth.toISOString().slice(0, 7),
      totalCost: Math.round(total * 100) / 100,
      byProvider,
      requestCount: entries.length,
    };
  }

  async getSummary() {
    const ledger = await this._load();
    const monthly = await this.getMonthlySpend();
    return {
      allTimeCost: ledger.totalCost,
      allTimeTokens: ledger.totalTokens,
      monthly,
      entries: ledger.entries.slice(-100).reverse(),
    };
  }

  async estimateCost(model, inputTokens, outputTokens) {
    return estimateCost(model, inputTokens, outputTokens);
  }

  getPricing(model) {
    return getPricing(model);
  }

  listPricing() {
    const dbPricing = getDbPricing();
    return { ...DEFAULT_PRICING, ...dbPricing };
  }

  updatePricing(model, input, output, provider) {
    prepare(
      "INSERT OR REPLACE INTO model_pricing (model, input, output, provider, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
    ).run(model, input, output, provider);
  }

  predictMonthlyCost(userId) {
    try {
      const rows = prepare(`
        SELECT DATE(created_at) as day, SUM(cost) as daily_cost
        FROM cost_logs WHERE user_id = ? AND created_at >= datetime('now', '-30 days')
        GROUP BY DATE(created_at) ORDER BY day
      `).all(userId);

      if (rows.length < 7) return { predicted: 0, confidence: 0, trend: 'stable' };

      const n = rows.length;
      const xMean = (n - 1) / 2;
      const yMean = rows.reduce((s, r) => s + r.daily_cost, 0) / n;
      let num = 0,
        den = 0;
      for (let i = 0; i < n; i++) {
        num += (i - xMean) * (rows[i].daily_cost - yMean);
        den += (i - xMean) * (i - xMean);
      }
      const slope = den !== 0 ? num / den : 0;
      const intercept = yMean - slope * xMean;
      const predicted = Math.round((intercept + slope * 30) * 100) / 100;
      const trend = slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable';

      return { predicted: Math.max(0, predicted), confidence: Math.min(1, n / 30), trend };
    } catch {
      return { predicted: 0, confidence: 0, trend: 'stable' };
    }
  }
}
