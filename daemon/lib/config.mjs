import * as fs from 'node:fs/promises';
import path from 'node:path';

export async function loadConfig(projectRoot) {
  const configPath = path.join(projectRoot, '.nokta', 'config.json');
  const config = {
    port: parseInt(process.env.NOKTA_PORT || '4217', 10),
    host: process.env.NOKTA_HOST || '127.0.0.1',
    logLevel: process.env.NOKTA_LOG_LEVEL || 'info',
    providers: {},
    cors: { origin: process.env.NOKTA_CORS_ORIGIN || '' },
    rateLimit: { windowMs: 60000, max: parseInt(process.env.NOKTA_RATE_LIMIT || '100', 10) },
    projectRoot,
  };

  try {
    const fileConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
    Object.assign(config, fileConfig);
  } catch {}

  if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
    config.port = 4217;
  }
  if (typeof config.host !== 'string') {
    config.host = '127.0.0.1';
  }
  if (!['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
    config.logLevel = 'info';
  }

  config.providers = {
    ollama: { baseUrl: process.env.OLLAMA_HOST || 'http://localhost:11434' },
    openai: { apiKey: process.env.OPENAI_API_KEY || '', enabled: Boolean(process.env.OPENAI_API_KEY) },
    claude: { apiKey: process.env.ANTHROPIC_API_KEY || '', enabled: Boolean(process.env.ANTHROPIC_API_KEY) },
    openrouter: { apiKey: process.env.OPENROUTER_API_KEY || '', enabled: Boolean(process.env.OPENROUTER_API_KEY) },
    ...config.providers,
  };

  return config;
}
