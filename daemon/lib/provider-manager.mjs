import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { acquireLock, releaseLock } from './lock.mjs';
import * as crypto from 'node:crypto';
import { encrypt, decrypt } from './crypto.mjs';
import { prepare } from '../db/connection.mjs';
import { OllamaProvider } from '../providers/ollama.mjs';
import { ClaudeProvider } from '../providers/claude.mjs';
import { OpenAIProvider } from '../providers/openai.mjs';
import { OpenRouterProvider } from '../providers/openrouter.mjs';

const PROVIDER_CLASSES = {
  ollama: OllamaProvider,
  claude: ClaudeProvider,
  openai: OpenAIProvider,
  openrouter: OpenRouterProvider,
};

const CONFIG_PATH = path.join(homedir(), '.nokta', 'providers.json');

export class ProviderManager {
  constructor(options = {}) {
    this.providers = new Map();
    this._defaultProvider = null;
    this._autoRoute = true;
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this._dbUserId = null;
  }

  setDbUser(userId) {
    this._dbUserId = userId;
  }

  getDbUser() {
    return this._dbUserId;
  }

  async _loadPersisted() {
    try {
      const data = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
      return data;
    } catch {
      return {};
    }
  }

  async _savePersist() {
    await acquireLock('provider-config', 3000);
    try {
      await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
      const configs = {};
      for (const [id, p] of this.providers) {
        configs[id] = p.toJSON();
      }
      configs._defaultProvider = this._defaultProvider;
      configs._autoRoute = this._autoRoute;
      await fs.writeFile(CONFIG_PATH, JSON.stringify(configs, null, 2), 'utf8');
    } catch {
      // silent
    } finally {
      releaseLock('provider-config');
    }
  }

  _loadFromDb(userId) {
    const rows = prepare(
      'SELECT provider, key_encrypted, key_nonce, key_tag, base_url, models, enabled FROM provider_keys WHERE user_id = ?',
    ).all(userId);
    const configs = {};
    for (const row of rows) {
      try {
        const apiKey = decrypt(row.key_encrypted, row.key_nonce, row.key_tag);
        configs[row.provider] = {
          apiKey,
          baseUrl: row.base_url || undefined,
          models: row.models ? JSON.parse(row.models) : undefined,
          enabled: Boolean(row.enabled),
        };
      } catch (err) {
        this.log.error(`Failed to decrypt key for ${row.provider}: ${err.message}`);
      }
    }
    return configs;
  }

  _saveToDb(userId) {
    const existing = prepare('SELECT provider FROM provider_keys WHERE user_id = ?')
      .all(userId)
      .map((r) => r.provider);

    for (const [id, p] of this.providers) {
      if (!p.apiKey) continue;

      try {
        const { encrypted, nonce, tag } = encrypt(p.apiKey);
        const baseUrl = p.baseUrl || null;
        const models = p.models?.length ? JSON.stringify(p.models) : null;
        const enabled = p.enabled !== false ? 1 : 0;

        if (existing.includes(id)) {
          prepare(`
            UPDATE provider_keys SET key_encrypted = ?, key_nonce = ?, key_tag = ?,
              base_url = ?, models = ?, enabled = ?, created_at = datetime('now')
            WHERE user_id = ? AND provider = ?
          `).run(encrypted, nonce, tag, baseUrl, models, enabled, userId, id);
        } else {
          const keyId = `pk_${crypto.randomBytes(16).toString('hex')}`;
          prepare(`
            INSERT INTO provider_keys (id, user_id, provider, key_encrypted, key_nonce, key_tag, base_url, models, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(keyId, userId, id, encrypted, nonce, tag, baseUrl, models, enabled);
        }
      } catch (err) {
        this.log.error(`Failed to encrypt key for ${id}: ${err.message}`);
      }
    }

    // Remove providers that are no longer in the map
    const currentIds = new Set(this.providers.keys());
    for (const provider of existing) {
      if (!currentIds.has(provider)) {
        prepare('DELETE FROM provider_keys WHERE user_id = ? AND provider = ?').run(userId, provider);
      }
    }
  }

  async _migrateFileToDb(userId) {
    try {
      const persisted = await this._loadPersisted();
      const hasKeys = Object.keys(persisted).some((k) => {
        const v = persisted[k];
        return v && typeof v === 'object' && (v.apiKey || v.apiKey === '');
      });
      if (!hasKeys) return;

      const existing = prepare('SELECT provider FROM provider_keys WHERE user_id = ?')
        .all(userId)
        .map((r) => r.provider);
      if (existing.length > 0) return; // Already has DB entries, skip migration

      for (const [id, config] of Object.entries(persisted)) {
        if (id.startsWith('_') || !config || typeof config !== 'object') continue;
        if (!config.apiKey) continue;

        try {
          const { encrypted, nonce, tag } = encrypt(config.apiKey);
          const keyId = `pk_${crypto.randomBytes(16).toString('hex')}`;
          const baseUrl = config.baseUrl || null;
          const models = config.models ? JSON.stringify(config.models) : null;
          const enabled = config.enabled !== false ? 1 : 0;
          prepare(`
            INSERT INTO provider_keys (id, user_id, provider, key_encrypted, key_nonce, key_tag, base_url, models, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(keyId, userId, id, encrypted, nonce, tag, baseUrl, models, enabled);
        } catch (err) {
          this.log.error(`Migration failed for ${id}: ${err.message}`);
        }
      }

      this.log.info(`Migrated provider keys from file to DB for user ${userId}`);
    } catch (err) {
      this.log.error(`Migration from file to DB failed: ${err.message}`);
    }
  }

  register(config) {
    const Klass = PROVIDER_CLASSES[config.id];
    if (!Klass) throw new Error(`Unknown provider: ${config.id}`);
    const provider = new Klass(config);
    this.providers.set(provider.id, provider);
    if (!this._defaultProvider) this._defaultProvider = provider.id;
    return provider;
  }

  async configure(id, updates = {}) {
    const existing = this.providers.get(id);
    if (existing) {
      for (const key of ['apiKey', 'baseUrl', 'models', 'enabled', 'maxTokens', 'temperature']) {
        if (updates[key] !== undefined) existing[key] = updates[key];
      }
    } else {
      const Klass = PROVIDER_CLASSES[id];
      if (!Klass) throw new Error(`Unknown provider: ${id}`);
      const provider = new Klass({ id, ...updates });
      this.providers.set(provider.id, provider);
      if (!this._defaultProvider) this._defaultProvider = provider.id;
    }
    await this._persistConfig();
  }

  async _persistConfig() {
    if (this._dbUserId) {
      try {
        this._saveToDb(this._dbUserId);
      } catch (err) {
        this.log.error(`Failed to save to DB: ${err.message}`);
        // Fall back to file
        await this._savePersist();
      }
    } else {
      await this._savePersist();
    }
  }

  get(id) {
    return this.providers.get(id) || null;
  }

  getDefault() {
    return this.providers.get(this._defaultProvider) || null;
  }

  async setDefault(id) {
    if (!this.providers.has(id)) throw new Error(`Provider not registered: ${id}`);
    this._defaultProvider = id;
    await this._persistConfig();
  }

  async setAutoRoute(enabled) {
    this._autoRoute = enabled;
    await this._persistConfig();
  }

  list() {
    return Array.from(this.providers.values()).map((p) => p.toJSON());
  }

  async selectProvider(messages) {
    if (!this._autoRoute) {
      return this.getDefault();
    }

    const complexity = this.getDefault()?.classifyComplexity(messages) || 'low';
    const available = Array.from(this.providers.values()).filter((p) => {
      if (!p.enabled) return false;
      if (p.id === 'ollama') return true;
      return Boolean(p.apiKey);
    });

    if (available.length === 0) return null;
    if (available.length === 1) return available[0];

    if (complexity === 'high') {
      const best =
        available.find((p) => p.id === 'claude' && p.apiKey) ||
        available.find((p) => p.id === 'openai' && p.apiKey) ||
        available.find((p) => p.id === 'openrouter' && p.apiKey) ||
        available[0];
      return best;
    }

    if (complexity === 'medium') {
      const best =
        available.find((p) => p.id === 'openai' && p.apiKey) ||
        available.find((p) => p.id === 'openrouter' && p.apiKey) ||
        available.find((p) => p.id === 'claude' && p.apiKey) ||
        available.find((p) => p.id === 'ollama');
      return best;
    }

    return (
      available.find((p) => p.id === 'ollama') || available.find((p) => p.id === 'openai' && p.apiKey) || available[0]
    );
  }

  async saveConfig() {
    await this._persistConfig();
  }

  async initDefaults(userId = null) {
    const actualUserId = userId || this._dbUserId;
    const dbConfigs = {};

    if (actualUserId) {
      // Load from DB
      const dbData = this._loadFromDb(actualUserId);
      Object.assign(dbConfigs, dbData);
      // Try migrating from file to DB if no DB entries exist
      await this._migrateFileToDb(actualUserId);
    }

    // Load from file (fallback for keys not in DB, or anonymous mode)
    const fileConfigs = actualUserId ? {} : await this._loadPersisted();

    // Merge: DB > file > env vars
    const getKey = (provider, field) => {
      if (dbConfigs[provider] && dbConfigs[provider][field] !== undefined) return dbConfigs[provider][field];
      if (fileConfigs[provider] && fileConfigs[provider][field] !== undefined) return fileConfigs[provider][field];
      return undefined;
    };

    this.register({ id: 'ollama', ...fileConfigs.ollama, ...dbConfigs.ollama, enabled: true });

    const openaiApiKey = getKey('openai', 'apiKey') || process.env.OPENAI_API_KEY || '';
    const openaiEnabled =
      dbConfigs.openai?.enabled ??
      (fileConfigs.openai ? fileConfigs.openai.enabled !== false : Boolean(process.env.OPENAI_API_KEY));
    this.register({
      id: 'openai',
      ...fileConfigs.openai,
      ...dbConfigs.openai,
      apiKey: openaiApiKey,
      enabled: openaiEnabled,
    });

    const claudeApiKey = getKey('claude', 'apiKey') || process.env.ANTHROPIC_API_KEY || '';
    const claudeEnabled =
      dbConfigs.claude?.enabled ??
      (fileConfigs.claude ? fileConfigs.claude.enabled !== false : Boolean(process.env.ANTHROPIC_API_KEY));
    this.register({
      id: 'claude',
      ...fileConfigs.claude,
      ...dbConfigs.claude,
      apiKey: claudeApiKey,
      enabled: claudeEnabled,
    });

    const openrouterApiKey = getKey('openrouter', 'apiKey') || process.env.OPENROUTER_API_KEY || '';
    const openrouterEnabled =
      dbConfigs.openrouter?.enabled ??
      (fileConfigs.openrouter ? fileConfigs.openrouter.enabled !== false : Boolean(process.env.OPENROUTER_API_KEY));
    this.register({
      id: 'openrouter',
      ...fileConfigs.openrouter,
      ...dbConfigs.openrouter,
      apiKey: openrouterApiKey,
      enabled: openrouterEnabled,
    });

    if (fileConfigs._defaultProvider) this._defaultProvider = fileConfigs._defaultProvider;
    if (dbConfigs._defaultProvider) this._defaultProvider = dbConfigs._defaultProvider;
    if (fileConfigs._autoRoute !== undefined) this._autoRoute = fileConfigs._autoRoute;

    const ollama = this.get('ollama');
    if (ollama) ollama.listModels().catch(() => {});
    return this;
  }

  async health() {
    const results = {};
    const promises = Array.from(this.providers.entries()).map(async ([id, provider]) => {
      if (!provider.enabled) {
        results[id] = { status: 'skipped', provider: id };
        return;
      }
      try {
        results[id] = await provider.health();
      } catch (err) {
        results[id] = { status: 'error', provider: id, error: err.message };
      }
    });
    await Promise.all(promises);
    return results;
  }
}
