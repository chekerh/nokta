import fs from 'node:fs/promises';
import path from 'node:path';

// Detects which AI coding tool/agent is being used to build a project.
//
// Detection is evidence-based and deterministic: config directories, instruction
// files, and package.json dependencies that only exist when a tool is in use.
// Each match records the file's mtime so "most recently used tool" can be
// ranked. No network, no process scraping — the filesystem is the source of
// truth and it is testable.
export const TOOL_REGISTRY = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    instructionFile: 'CLAUDE.md',
    dirs: ['.claude'],
    files: ['CLAUDE.md'],
    deps: ['@anthropic-ai/claude-code'],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    instructionFile: 'AGENTS.md',
    dirs: ['.codex'],
    files: ['AGENTS.md'],
    deps: ['@openai/codex'],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    instructionFile: '.cursorrules',
    dirs: ['.cursor'],
    files: ['.cursorrules'],
    deps: [],
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    instructionFile: '.windsurfrules',
    dirs: ['.windsurf'],
    files: ['.windsurfrules'],
    deps: [],
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    instructionFile: '.github/copilot-instructions.md',
    dirs: [],
    files: ['.github/copilot-instructions.md'],
    deps: [],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    instructionFile: 'AGENTS.md',
    dirs: ['.opencode'],
    files: ['opencode.json'],
    deps: ['opencode-ai'],
  },
  {
    id: 'aider',
    name: 'Aider',
    instructionFile: 'AGENTS.md',
    dirs: [],
    files: ['.aider.conf.yml'],
    deps: ['aider-chat'],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    instructionFile: 'GEMINI.md',
    dirs: ['.gemini'],
    files: ['GEMINI.md'],
    deps: ['@google/gemini-cli'],
  },
  {
    id: 'continue',
    name: 'Continue',
    instructionFile: 'AGENTS.md',
    dirs: ['.continue'],
    files: [],
    deps: ['@continuedev/cli'],
  },
];

// Global per-user configuration directories. Their presence means the tool is
// installed on this machine, independent of any single project.
export const GLOBAL_HOME_DIRS = {
  'claude-code': '.claude',
  codex: '.codex',
  cursor: '.cursor',
  windsurf: '.windsurf',
  opencode: path.join('.config', 'opencode'),
  gemini: '.gemini',
  continue: '.continue',
  aider: '.aider',
};

const SCORE_DIR = 2;
const SCORE_FILE = 3;
const SCORE_DEP = 2;

async function statOrNull(target) {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}

async function readPackageDependencies(rootPath) {
  const stat = await statOrNull(path.join(rootPath, 'package.json'));
  if (!stat || !stat.isFile()) return null;
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(rootPath, 'package.json'), 'utf8'));
    return { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
  } catch {
    return null;
  }
}

// Inspect a single project folder and rank every tool with real evidence in it.
export async function detectProjectTools(rootPath) {
  const tools = [];
  const instructionFiles = [];
  const deps = await readPackageDependencies(rootPath);

  for (const tool of TOOL_REGISTRY) {
    const matched = [];
    let score = 0;
    let lastUsedAt = null;

    for (const dir of tool.dirs) {
      const stat = await statOrNull(path.join(rootPath, dir));
      if (stat?.isDirectory()) {
        matched.push({ kind: 'dir', value: dir, at: stat.mtime.toISOString() });
        score += SCORE_DIR;
        if (!lastUsedAt || stat.mtime > lastUsedAt) lastUsedAt = stat.mtime;
      }
    }

    for (const file of tool.files) {
      const stat = await statOrNull(path.join(rootPath, file));
      if (stat?.isFile()) {
        matched.push({ kind: 'file', value: file, at: stat.mtime.toISOString() });
        score += SCORE_FILE;
        if (!lastUsedAt || stat.mtime > lastUsedAt) lastUsedAt = stat.mtime;
        if (file === tool.instructionFile) instructionFiles.push(file);
      }
    }

    for (const dep of tool.deps) {
      if (deps && deps[dep]) {
        matched.push({ kind: 'dependency', value: dep, at: null });
        score += SCORE_DEP;
      }
    }

    if (score > 0) tools.push({ id: tool.id, name: tool.name, instructionFile: tool.instructionFile, score, matched, lastUsedAt: lastUsedAt ? lastUsedAt.toISOString() : null });
  }

  // Highest score wins; recency breaks ties so "most recently used" is the default target.
  tools.sort((a, b) => b.score - a.score || String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')));

  return {
    rootPath,
    tools,
    primary: tools[0] ? { id: tools[0].id, name: tools[0].name, instructionFile: tools[0].instructionFile } : null,
    instructionFiles: [...new Set(instructionFiles)],
  };
}

// Which of these tools are installed for the current user, regardless of project.
export async function detectInstalledTools(homeDir) {
  const home = homeDir || process.env.HOME || process.env.USERPROFILE || '';
  const installed = [];
  for (const [id, relative] of Object.entries(GLOBAL_HOME_DIRS)) {
    const stat = await statOrNull(path.join(home, relative));
    if (stat) installed.push({ id, at: stat.mtime.toISOString() });
  }
  installed.sort((a, b) => b.at.localeCompare(a.at));
  return installed;
}

// Combine per-project and machine-wide evidence into one answer for the UI.
export async function inspectProjectTooling(rootPath, { homeDir } = {}) {
  const [project, installed] = await Promise.all([detectProjectTools(rootPath), detectInstalledTools(homeDir)]);
  return {
    ...project,
    installed: installed.map(tool => ({ ...tool, inProject: project.tools.some(candidate => candidate.id === tool.id) })),
    // A tool installed on the machine but with no footprint in this project is a
    // candidate, not evidence. The UI shows it separately.
    candidates: installed.filter(tool => !project.tools.some(candidate => candidate.id === tool.id)),
  };
}
