import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISCOVERY_CACHE = path.join(__dirname, '..', '..', '.nokta', 'discovery-cache.json');
const REPO_CACHE = path.join(process.env.NOKTA_DATA_DIR || path.join(__dirname, '..', '..', '.nokta', 'repo-cache'));
const CACHE_TTL_MS = parseInt(process.env.NOKTA_DISCOVERY_CACHE_TTL_MS || '21600000', 10);

async function loadCache() {
  try {
    const data = await fs.readFile(DISCOVERY_CACHE, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveCache(data) {
  const dir = path.dirname(DISCOVERY_CACHE);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
  await fs.writeFile(DISCOVERY_CACHE, JSON.stringify(data, null, 2));
}

function isCacheFresh(cached) {
  if (!cached || !cached.generatedAt) return false;
  const age = Date.now() - new Date(cached.generatedAt).getTime();
  return age < CACHE_TTL_MS;
}

function parseRepoUrl(url) {
  url = url.replace(/\.git$/, '').trim();
  const match = url.match(/github\.com[:/]([^/]+)\/([^/]+)/);
  if (match) return { owner: match[1], repo: match[2].replace(/\.git$/, ''), url };
  const parts = url.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];
  if (secondLast && last) return { owner: secondLast, repo: last.replace(/\.git$/, ''), url };
  return { owner: 'unknown', repo: last || 'unknown', url };
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Nokta-Discovery/0.1', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchGitHubTrending() {
  const queries = [
    'ai-agent+stars:>500',
    'mcp-server+stars:>100',
    'agent-framework+stars:>500',
    'ai-tools+stars:>1000',
    'prompt-engineering+stars:>100',
    'llm-agents+stars:>500',
    'developer-tools+stars:>1000',
    'code-assistant+stars:>500',
  ];
  const results = [];
  for (const q of queries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=3`;
      const data = await fetchJson(url);
      if (data && data.items) {
        for (const item of data.items) {
          results.push({
            type: 'github',
            source: 'github-trending',
            name: item.full_name,
            url: item.html_url,
            description: item.description || '',
            stars: item.stargazers_count,
            language: item.language,
            topics: item.topics || [],
            updatedAt: item.updated_at,
            score: item.score,
            reason: `Trending: ${q.replace(/\+.*/, '')}`,
          });
        }
      }
    } catch {
      continue;
    }
  }
  const seen = new Set();
  return results
    .filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 30);
}

async function searchNpmTrending() {
  const queries = [
    'ai+agent+skills',
    'mcp+server',
    'ai+cli+tools',
    'prompt+engineering',
    'agent+frameworks',
    'ai+developer+tools',
    'llm+agents',
  ];
  const results = [];
  for (const query of queries) {
    try {
      const url = `https://registry.npmjs.org/-/v1/search?text=${query}&size=10&popularity=1.0`;
      const data = await fetchJson(url, 8000);
      if (data.objects) {
        for (const obj of data.objects) {
          const pkg = obj.package;
          results.push({
            type: 'npm',
            source: 'npm-trending',
            name: pkg.name,
            url: pkg.links?.npm || `https://www.npmjs.com/package/${pkg.name}`,
            description: pkg.description || '',
            publisher: pkg.publisher?.username || '',
            version: pkg.version,
            date: pkg.date,
            score: obj.score?.final || 0,
            keywords: pkg.keywords || [],
            reason: `Found in "${query}"`,
          });
        }
      }
    } catch {
      continue;
    }
  }
  // Deduplicate and sort by score
  const seen = new Set();
  return results
    .filter((r) => {
      if (seen.has(r.name)) return false;
      seen.add(r.name);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

async function checkSourceUpdates() {
  const results = [];
  const cachePath = path.join(__dirname, '..', '..', '.nokta', 'skill-sources.json');
  try {
    await fs.access(cachePath);
  } catch {
    return results;
  }

  try {
    const sources = JSON.parse((await fs.readFile(cachePath, 'utf8')) || '[]');
    for (const source of sources) {
      if (!source.url) continue;
      try {
        const { repo } = parseRepoUrl(source.url);
        const localPath = path.join(REPO_CACHE, repo);
        try {
          await fs.access(localPath);
        } catch {
          continue;
        }

        const prevHead = execSync(`cd "${localPath}" && git rev-parse HEAD`, {
          encoding: 'utf8',
          timeout: 5000,
        }).trim();
        execSync(`cd "${localPath}" && git fetch --depth 2 origin 2>/dev/null`, { stdio: 'pipe', timeout: 15000 });
        const newHead = execSync(`cd "${localPath}" && git rev-parse origin/HEAD 2>/dev/null || echo "${prevHead}"`, {
          encoding: 'utf8',
          timeout: 5000,
        }).trim();

        if (newHead !== prevHead) {
          const log = execSync(
            `cd "${localPath}" && git log --oneline ${prevHead}..${newHead} 2>/dev/null | head -10`,
            { encoding: 'utf8', timeout: 5000 },
          );
          results.push({
            type: 'update',
            source: 'cached-source',
            name: source.name || repo,
            url: source.url,
            description: `New commits available for ${source.name || repo}`,
            newCommits: log.trim() ? log.trim().split('\n').length : 0,
            commitLog: log.trim().split('\n').slice(0, 5),
            skills: source.skills || 0,
            agents: source.agents || 0,
            reason: 'Update available in cached source',
          });
        }
      } catch {
        continue;
      }
    }
  } catch {
    /* ignore */
  }
  return results;
}

export async function runDiscovery(force = false) {
  const cached = await loadCache();
  if (!force && cached && isCacheFresh(cached)) {
    return cached;
  }

  const [githubResults, npmResults, sourceUpdates] = await Promise.all([
    searchGitHubTrending().catch(() => []),
    searchNpmTrending().catch(() => []),
    (async () => {
      try {
        return await checkSourceUpdates();
      } catch {
        return [];
      }
    })(),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    summary: {
      totalDiscovery: githubResults.length + npmResults.length + sourceUpdates.length,
      githubRepos: githubResults.length,
      npmPackages: npmResults.length,
      sourceUpdates: sourceUpdates.length,
    },
    discoveries: [...sourceUpdates, ...githubResults, ...npmResults],
  };

  await saveCache(report);
  return report;
}

export async function getCachedReport() {
  const cached = await loadCache();
  if (cached && isCacheFresh(cached)) return cached;
  return null;
}
