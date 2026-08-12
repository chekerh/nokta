import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authMiddleware } from '../lib/auth.mjs';
import { runDiscovery, getCachedReport } from '../lib/discovery.mjs';
import { asyncHandler, AppError } from '../lib/route-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCAN_CACHE_DIR = path.join(__dirname, '..', '..', '.nokta', 'skill-sources.json');
const REPO_CACHE = path.join(process.env.NOKTA_DATA_DIR || path.join(__dirname, '..', '..', '.nokta', 'repo-cache'));

async function ensureCache() {
  const dir = path.dirname(SCAN_CACHE_DIR);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
  try {
    await fs.access(SCAN_CACHE_DIR);
  } catch {
    await fs.writeFile(SCAN_CACHE_DIR, '[]');
  }
}

async function loadSources() {
  await ensureCache();
  try {
    return JSON.parse(await fs.readFile(SCAN_CACHE_DIR, 'utf8'));
  } catch {
    return [];
  }
}

async function saveSources(sources) {
  await ensureCache();
  await fs.writeFile(SCAN_CACHE_DIR, JSON.stringify(sources, null, 2));
}

async function safeDirSize(dir) {
  try {
    let count = 0;
    await walkDir(dir, () => count++);
    return count;
  } catch {
    return 0;
  }
}

async function walkDir(dir, fn) {
  try {
    await fs.access(dir);
  } catch {
    return;
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkDir(full, fn);
    else fn(full);
  }
}

async function countFiles(dir, ext) {
  let count = 0;
  try {
    await fs.access(dir);
  } catch {
    return count;
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await countFiles(full, ext);
    else if (ext ? entry.name.endsWith(ext) : true) count++;
  }
  return count;
}

async function countDirs(dir) {
  let count = 0;
  try {
    await fs.access(dir);
  } catch {
    return count;
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count++;
      count += await countDirs(path.join(dir, entry.name));
    }
  }
  return count;
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

async function cloneRepo(url) {
  const { repo } = parseRepoUrl(url);
  const target = path.join(REPO_CACHE, repo);

  try {
    await fs.access(target);
    try {
      execFileSync('git', ['pull', '--ff-only'], { cwd: target, stdio: 'pipe', timeout: 30000 });
    } catch {}
    return target;
  } catch {}

  try {
    await fs.access(REPO_CACHE);
  } catch {
    await fs.mkdir(REPO_CACHE, { recursive: true });
  }
  execFileSync('git', ['clone', '--depth', '1', url, target], { stdio: 'pipe', timeout: 60000 });
  return target;
}

async function scanRepo(dir) {
  const skillsDir = path.join(dir, 'skills');
  const agentsDir = path.join(dir, 'agents');
  const packsDir = path.join(dir, 'packs');
  const commandsDir = path.join(dir, 'commands');
  const rulesDir = path.join(dir, 'rules');
  const mcpDir = path.join(dir, 'mcp-configs');
  const opencodeDir = path.join(dir, '.opencode');
  const cursorSkillsDir = path.join(dir, '.cursor', 'skills');

  const [agentsCount, packsCount, commandsCount, mcpConfigsCount, dotfilesCount, rulesCount, totalFiles] =
    await Promise.all([
      (async () => (await countFiles(agentsDir, '.json')) + (await countFiles(agentsDir, '.md')))(),
      countDirs(packsDir),
      (async () =>
        (await countFiles(commandsDir, '.md')) + (await countFiles(path.join(opencodeDir, 'commands'), '.md')))(),
      (async () => (await countFiles(mcpDir, '.json')) + (await countFiles(dir, '.mcp.json')))(),
      (async () => (await countFiles(opencodeDir, '.json')) + (await countFiles(opencodeDir, '.md')))(),
      countFiles(rulesDir, '.md'),
      safeDirSize(dir),
    ]);

  return {
    name: path.basename(dir),
    path: dir,
    skills: (await countDirs(skillsDir)) + (await countDirs(cursorSkillsDir)),
    agents: agentsCount,
    packs: packsCount,
    commands: commandsCount,
    mcpConfigs: mcpConfigsCount,
    rules: rulesCount,
    dotFiles: dotfilesCount,
    totalFiles,
  };
}

export function registerSkillRoutes(app, log) {
  // List known/cached sources
  app.get(
    '/api/v1/skills/sources',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const sources = await loadSources();
      res.json({ sources });
    }),
  );

  // Scan a repo URL for skills
  app.post(
    '/api/v1/skills/scan',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { url } = req.body || {};
      if (!url) throw new AppError('url is required', 400);
      if (!/^https?:\/\/(www\.)?github\.com\//.test(url)) {
        throw new AppError('Only GitHub URLs are supported', 400);
      }

      const dir = await cloneRepo(url);
      const result = await scanRepo(dir);
      const sources = await loadSources();

      const existing = sources.findIndex((s) => s.url === url);
      const entry = { url, name: result.name, scannedAt: new Date().toISOString(), ...result };
      if (existing >= 0) sources[existing] = entry;
      else sources.push(entry);
      await saveSources(sources);

      res.json(entry);
    }),
  );

  // Import scanned skills into Nokta
  app.post(
    '/api/v1/skills/import',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { url } = req.body || {};
      if (!url) throw new AppError('url is required', 400);

      const dir = await cloneRepo(url);
      const result = await scanRepo(dir);
      const agentsDir = path.join(dir, 'agents');
      const noktaAgents = path.join(__dirname, '..', '..', 'agents');
      const noktaPacks = path.join(__dirname, '..', '..', 'packs');

      let skillsImported = 0;
      let agentsImported = 0;

      // Copy agent definitions
      try {
        const entries = await fs.readdir(agentsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.md'))) {
            const src = path.join(agentsDir, entry.name);
            const dst = path.join(noktaAgents, `imported-${entry.name}`);
            try {
              await fs.access(dst);
            } catch {
              await fs.copyFile(src, dst);
              agentsImported++;
            }
          }
        }
      } catch {}

      // Create a reference pack from scan results
      const packDir = path.join(noktaPacks, 'sources');
      try {
        await fs.access(packDir);
      } catch {
        await fs.mkdir(packDir, { recursive: true });
      }

      const packId = `source.${result.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
      const packPath = path.join(packDir, `${packId}.pack.json`);
      try {
        await fs.access(packPath);
      } catch {
        const pack = {
          id: packId,
          version: '0.1.0',
          kind: 'reference',
          title: `Source: ${result.name}`,
          summary: `Imported from ${url}. ${result.skills} skills, ${result.agents} agents, ${result.packs} packs.`,
          priority: 30,
          tokenCost: 100,
          required: false,
          triggers: { stacks: [], taskTypes: [], files: [], keywords: [] },
          appliesTo: ['all'],
          instructions: [
            `This project contains ${result.skills} skills in ${result.name}.`,
            `Reference path: ${dir}`,
            `Source URL: ${url}`,
            'Consider scanning individual skills directories for relevant domain knowledge.',
          ],
          evidenceRequirements: ['Scan the source repo for specific skills relevant to the current task'],
          gates: [],
          sourceRefs: [url, dir],
        };
        await fs.writeFile(packPath, JSON.stringify(pack, null, 2));
        skillsImported += result.skills;
      }

      res.json({
        name: result.name,
        url,
        skillsImported,
        agentsImported,
        packsImported: 1,
        sourcePackPath: packPath,
        message: `Imported ${skillsImported} skills and ${agentsImported} agents. Reference pack created at ${packPath}`,
      });
    }),
  );

  // Health: cached sources count
  app.get(
    '/api/v1/skills',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const sources = await loadSources();
      res.json({ cachedSources: sources.length, sources });
    }),
  );

  // Discovery: auto-search the web for new skills, tools, and updates
  app.get('/api/v1/discover', authMiddleware(), async (req, res) => {
    const force = req.query.force === 'true';
    try {
      const report = await runDiscovery(force);
      res.json(report);
    } catch (err) {
      log.error('Discovery failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // Discovery: get cached report only (no new search)
  app.get('/api/v1/discover/cached', authMiddleware(), async (req, res) => {
    const report = await getCachedReport();
    if (report) return res.json(report);
    res.json({
      generatedAt: null,
      summary: { totalDiscovery: 0, githubRepos: 0, npmPackages: 0, sourceUpdates: 0 },
      discoveries: [],
    });
  });
}
