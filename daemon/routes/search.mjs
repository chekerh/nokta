import * as fs from 'node:fs';
import * as path from 'node:path';
import { asyncHandler, AppError } from '../lib/route-utils.mjs';

const IGNORE_EXTS = new Set([
  '.jpg',
  '.png',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.eot',
  '.ttf',
  '.mp4',
  '.mp3',
  '.webm',
  '.zip',
  '.tar',
  '.gz',
  '.br',
  '.o',
  '.so',
  '.dylib',
  '.exe',
  '.dll',
  '.map',
  '.min.js',
  '.min.css',
]);

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  '.cache',
  '.ai/trail/events',
  'vendor',
  '.bundle',
]);

const TEXT_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.java',
  '.kt',
  '.kts',
  '.swift',
  '.rs',
  '.go',
  '.rb',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.json',
  '.yaml',
  '.yml',
  '.md',
  '.txt',
  '.toml',
  '.env',
  '.gitignore',
  '.dockerfile',
  '.xml',
  '.sql',
  '.prisma',
  '.graphql',
  '.php',
  '.ex',
  '.exs',
  '.hs',
  '.lhs',
  '.scala',
  '.sc',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.cxx',
  '.pl',
  '.pm',
  '.lua',
  '.r',
  '.jl',
  '.zig',
  '.cr',
  '.vue',
  '.svelte',
  '.astro',
  '.cs',
  '.fs',
  '.erl',
  '.hrl',
  '.clj',
  '.cljs',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.tf',
  '.hcl',
  '.dockerfile',
]);

const SYMBOL_PATTERNS = [
  { name: 'function', regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g },
  { name: 'class', regex: /(?:export\s+)?class\s+(\w+)/g },
  { name: 'method', regex: /(\w+)\s*[=(]\s*(?:async\s*)?[=(]\s*\)/g },
  { name: 'interface', regex: /(?:export\s+)?interface\s+(\w+)/g },
  { name: 'type', regex: /(?:export\s+)?type\s+(\w+)\s*=/g },
  { name: 'def', regex: /def\s+(\w+)/g },
  { name: 'fn', regex: /fn\s+(\w+)/g },
  { name: 'func', regex: /func\s+(\w+)/g },
  { name: 'const', regex: /(?:export\s+)?const\s+(\w+)\s*[:=]/g },
];

const SEARCH_HISTORY = [];

function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_$@.]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && t.length < 100);
}

function isLikelySymbol(text) {
  const symbolPrefixes = ['fn:', 'func:', 'class:', 'def:', 'function:'];
  if (symbolPrefixes.some((p) => text.startsWith(p))) return true;
  return /^[A-Z]\w+$/.test(text.trim()) || /^[a-z_]\w*\(\)$/.test(text.trim());
}

function extractSymbols(content) {
  const symbols = [];
  for (const { name, regex } of SYMBOL_PATTERNS) {
    const matches = content.matchAll(regex);
    for (const m of matches) {
      symbols.push({ kind: name, name: m[1] });
    }
  }
  return symbols;
}

function fuzzyNameMatch(fileName, query, threshold) {
  threshold = threshold || Math.max(2, Math.floor(query.length * 0.35));
  const name = path
    .basename(fileName)
    .toLowerCase()
    .replace(/\.[^.]+$/, '');
  if (name === query) return 100;
  if (name.includes(query)) return 80;
  const dist = levenshtein(name, query);
  if (dist <= threshold) return Math.max(0, 60 - dist * 5);
  return 0;
}

function scoreFile(filepath, queryTokens, content, symbolTarget) {
  const lowerContent = content.toLowerCase();
  const fileLower = filepath.toLowerCase();

  let score = 0;
  const matches = [];

  // Token matching
  for (const token of queryTokens) {
    if (fileLower.includes(token)) {
      score += 50;
      matches.push(`file:${token}`);
    }
    const count = (lowerContent.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (count > 0) {
      score += count * 2;
      if (count > 10) score += 5;
      if (count > 50) score += 10;
      matches.push(`content:${token}(${count})`);
    }
  }

  // Symbol match bonus
  if (symbolTarget) {
    const symbols = extractSymbols(content);
    for (const sym of symbols) {
      if (sym.name.toLowerCase() === symbolTarget.toLowerCase()) {
        score += 200;
        matches.push(`symbol:${sym.name}`);
      }
    }
  }

  // Fuzzy name match bonus
  for (const token of queryTokens) {
    const fuzz = fuzzyNameMatch(filepath, token);
    if (fuzz > 0) {
      score += fuzz;
      matches.push(`fuzzy:${token}(${fuzz})`);
    }
  }

  return { score, matches };
}

function previewLines(lines, queryTokens, symbolTarget) {
  const matchingLines = [];
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    const matchesToken = queryTokens.some((t) => lower.includes(t));
    const matchesSymbol = symbolTarget && lower.includes(symbolTarget.toLowerCase());
    if (matchesToken || matchesSymbol) {
      matchingLines.push({ line: i + 1, text: lines[i].trim().slice(0, 200) });
    }
  }
  return matchingLines.slice(0, 10);
}

async function walkDir(dir, queryTokens, projectRoot, maxResults, scope, symbolTarget) {
  const results = [];
  const scopeDir = scope?.dir ? path.resolve(projectRoot, scope.dir) : null;
  const scopeExts = scope?.exts ? new Set(scope.exts.split(',').map((s) => s.trim().toLowerCase())) : null;

  async function walk(currentDir) {
    if (results.length >= maxResults * 2) return;
    let entries;
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    const dirsToWalk = [];
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) dirsToWalk.push(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTS.has(ext) || IGNORE_EXTS.has(ext)) continue;
      if (scopeExts && !scopeExts.has(ext)) continue;

      const relPath = path.relative(projectRoot, fullPath);
      if (scopeDir && !relPath.startsWith(path.relative(projectRoot, scopeDir))) continue;

      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.size > 100000) continue;

        const content = await fs.promises.readFile(fullPath, { encoding: 'utf8', flag: 'r' });
        const { score, matches } = scoreFile(relPath, queryTokens, content.slice(0, 10000), symbolTarget);

        if (score > 0) {
          const lines = content.split('\n');
          const matchingLines = previewLines(lines, queryTokens, symbolTarget);

          results.push({
            file: relPath,
            ext,
            score,
            matches,
            lines: matchingLines.slice(0, 10),
            snippet:
              matchingLines.length > 0
                ? matchingLines
                    .slice(0, 3)
                    .map((l) => `  ${l.line}: ${l.text}`)
                    .join('\n')
                : lines
                    .slice(0, 3)
                    .map((l, i) => `  ${i + 1}: ${l.trim().slice(0, 200)}`)
                    .join('\n'),
          });
        }
      } catch {}
    }

    for (const dirPath of dirsToWalk) {
      await walk(dirPath);
    }
  }

  await walk(scopeDir || projectRoot);
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

export function registerSearchRoutes(app) {
  app.post(
    '/api/v1/search',
    asyncHandler(async (req, res) => {
      const { query, target, maxResults = 20, dir, ext, regex } = req.body;
      if (!query) throw new AppError('Query is required', 400);

      const projectRoot = target || process.cwd();
      const symbolTarget = isLikelySymbol(query) ? query.replace(/^(?:fn|func|class|def|function):/, '') : null;
      const queryTokens = tokenize(query);
      const scope = { dir, exts: ext };

      // Add to search history
      SEARCH_HISTORY.unshift({ query, time: new Date().toISOString(), totalResults: 0 });
      if (SEARCH_HISTORY.length > 50) SEARCH_HISTORY.length = 50;

      if (regex) {
        let pattern;
        try {
          pattern = new RegExp(regex, 'gi');
        } catch {
          throw new AppError('Invalid regex pattern', 400);
        }
        const results = [];
        async function walk(currentDir) {
          if (results.length >= maxResults) return;
          let entries;
          try {
            entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
          } catch {
            return;
          }
          const dirs = [];
          for (const e of entries) {
            const fullPath = path.join(currentDir, e.name);
            if (e.isDirectory()) {
              if (!IGNORE_DIRS.has(e.name)) dirs.push(fullPath);
              continue;
            }
            const ext = path.extname(e.name).toLowerCase();
            if (!TEXT_EXTS.has(ext) || IGNORE_EXTS.has(ext)) continue;
            try {
              const stat = await fs.promises.stat(fullPath);
              if (stat.size > 100000) continue;
              const content = await fs.promises.readFile(fullPath, { encoding: 'utf8', flag: 'r' });
              const relPath = path.relative(projectRoot, fullPath);
              const matches = content.matchAll(pattern);
              const matchList = [];
              for (const m of matches) {
                if (matchList.length >= 5) break;
                matchList.push({ match: m[0].slice(0, 100), index: m.index });
              }
              if (matchList.length > 0) {
                results.push({
                  file: relPath,
                  ext,
                  regex: true,
                  matches: matchList,
                  snippet: matchList
                    .slice(0, 3)
                    .map((m) => `  ...${m.match}`)
                    .join('\n'),
                });
              }
            } catch {}
          }
          for (const d of dirs) await walk(d);
        }
        await walk(projectRoot);
        SEARCH_HISTORY[0].totalResults = results.length;
        return res.json({ results, total: results.length, history: SEARCH_HISTORY.slice(0, 5) });
      }

      const results = await walkDir(projectRoot, queryTokens, projectRoot, maxResults, scope, symbolTarget);
      SEARCH_HISTORY[0].totalResults = results.length;

      res.json({ results, total: results.length, history: SEARCH_HISTORY.slice(0, 5) });
    }),
  );

  app.get('/api/v1/search/history', (req, res) => {
    res.json({ history: SEARCH_HISTORY.slice(0, 50) });
  });
}
