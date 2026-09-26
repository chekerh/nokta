import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Directory names that never contain indexable skills. Mirrors the walker's
// own list and adds the ones found in a real skills tree: test corpora,
// security fixtures, harness mirrors, build output and vendored envs.
export const EXCLUDED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'assets',
  'tests',
  'test',
  'docs',
  '.venv',
  'venv',
  'fixtures',
  'bench',
  'examples',
  'workspaces',
  'oracle',
  'coverage',
  '__pycache__',
  '.next',
  '.cache',
]);

// Whole collections excluded, with the reason recorded so the index can
// explain itself. Keyed by the top-level directory name under the skills root.
export const EXCLUDED_SOURCES = {
  eigent: 'Electron app, not a skills repo. Its 6 "skills" are drifted forks of Anthropic docx/pptx/xlsx.',
  'iai-personal-memory-engine': 'MCP server + hooks, not skills. Competes with the docs/loop state protocol.',
};

// Defence in depth. The path rules above already keep a scanner's test corpus
// out, but a single malicious skill copied somewhere else would slip through
// on its path alone. These are the declared names of the SkillSpector attack
// fixtures: credential exfiltration, MCP tool poisoning, privilege
// escalation, jailbreak indirection and social-engineering chains.
export const EXCLUDED_SKILL_NAMES = new Set([
  'reаd_data', // Cyrillic U+0430 in place of Latin "a" - homoglyph evasion
  'chef-assistant',
  'code-formatter',
  'code-reviewer',
  'config-reader',
  'creative-writing-coach',
  'data-processor',
  'deploy-service',
  'file-indexer',
  'file-organizer',
  'friendly-greeter',
  'general-assistant',
  'helpful-formatter',
  'jp-compliance-reporter',
  'keyring-reference',
  'markdown-formatter',
  'onboarding-guide',
  'over-privileged-helper',
  'personal-assistant',
  'report-generator',
  'safe-greeting',
  'terraform-deployer',
  'text-summarizer',
  'underdeclared-agent',
]);

// HARNESS_MIRRORS are per-harness copies of a skill that already exists
// elsewhere in the tree. When two paths declare the same skill name, a path
// containing one of these segments loses.
const HARNESS_MIRRORS = new Set([
  '.claude',
  '.cursor',
  '.kiro',
  '.gemini',
  '.opencode',
  '.codex',
  '.agents',
  '.agent',
  '.github',
  '.dsh',
  '.grok',
  '.hermes',
  '.qoder',
  '.rovodev',
  '.trae',
  '.trae-cn',
  '.veto',
  '.vibe',
  '.pi',
  '.factory',
  '.mastracode',
  '.continue',
  '.codebuddy',
  '.openclaw',
  '.agentconfig',
  'plugin',
  'cursor-plugin',
  'resources',
]);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

export function parseFrontmatter(content) {
  const match = content.match(FRONTMATTER);
  if (!match) return null;
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!field) continue;
    meta[field[1].toLowerCase()] = field[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
  return meta;
}

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// Lower score wins. Canonical source beats harness mirror beats deep path.
function canonicalScore(skillPath) {
  const segments = skillPath.split(path.sep);
  let score = segments.length * 10;
  if (segments.some((s) => HARNESS_MIRRORS.has(s))) score += 500;
  // A directory literally named "skills" is the upstream source layout.
  if (segments.includes('skills')) score -= 25;
  return score;
}

function collectionOf(absolutePath, sourceRoot) {
  const relative = path.relative(sourceRoot, absolutePath);
  return relative.split(path.sep)[0] || '(root)';
}

/**
 * Walk a skills tree and return the deduplicated skills worth indexing.
 * A skill is kept only if its SKILL.md exists AND carries usable frontmatter,
 * which is what separates a real skill from a scratch note or a template stub.
 */
export async function discoverSkills(sourceRoot, options = {}) {
  const excludedSegments = options.excludedSegments || EXCLUDED_SEGMENTS;
  const excludedSources = options.excludedSources || EXCLUDED_SOURCES;
  const excludedNames = options.excludedSkillNames || EXCLUDED_SKILL_NAMES;
  const stats = { candidates: 0, noFrontmatter: 0, noName: 0, noDescription: 0, blockedName: 0, homoglyph: 0 };

  const found = [];
  const sourceExcluded = [];

  const walk = async (dir, depth) => {
    if (depth > 10) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (excludedSegments.has(entry.name)) {
          sourceExcluded.push({ path: full, reason: 'excluded directory' });
          continue;
        }
        if (depth === 0 && excludedSources[entry.name]) {
          sourceExcluded.push({ path: full, reason: excludedSources[entry.name] });
          continue;
        }
        await walk(full, depth + 1);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase() === 'skill.md') {
        stats.candidates++;
        const skillDir = path.dirname(full);
        let content;
        try {
          const stat = await fs.stat(full);
          if (stat.size > 150000) continue;
          content = await fs.readFile(full, 'utf8');
        } catch {
          continue;
        }
        const meta = parseFrontmatter(content);
        if (!meta) {
          stats.noFrontmatter++;
          continue;
        }
        if (!meta.name) {
          stats.noName++;
          continue;
        }
        if (!meta.description) {
          stats.noDescription++;
          continue;
        }
        if (excludedNames.has(meta.name)) {
          stats.blockedName++;
          continue;
        }
        // Homoglyph guard: a skill whose declared name carries non-ASCII
        // letters is trying to defeat an exact-match allowlist. No legitimate
        // skill in a curated tree does this.
        if (/[^\x20-\x7e]/.test(meta.name)) {
          stats.homoglyph++;
          continue;
        }
        found.push({
          name: meta.name,
          description: meta.description.slice(0, 300),
          dir: skillDir,
          file: full,
          contentHash: hash(content),
          collection: collectionOf(full, sourceRoot),
        });
      }
    }
  };

  await walk(sourceRoot, 0);

  // Collapse identical content first, then same-name survivors. Keeps the
  // freshest canonical copy of each skill.
  const byContent = new Map();
  for (const skill of found) {
    const existing = byContent.get(skill.contentHash);
    if (!existing || canonicalScore(skill.file) < canonicalScore(existing.file)) {
      byContent.set(skill.contentHash, skill);
    }
  }

  const byName = new Map();
  for (const skill of byContent.values()) {
    const existing = byName.get(skill.name);
    if (!existing || canonicalScore(skill.file) < canonicalScore(existing.file)) {
      byName.set(skill.name, skill);
    }
  }

  const skills = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { skills, stats, candidates: found.length, sourceExcluded };
}

async function linkTree(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__' || entry.name === 'node_modules') continue;
      await linkTree(src, dest);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      await fs.link(src, dest);
    } catch (error) {
      // Hardlinks fail across devices; fall back to a copy.
      if (error.code === 'EXDEV' || error.code === 'EPERM') await fs.copyFile(src, dest);
      else throw error;
    }
  }
}

/**
 * Build a hardlink farm of the curated skills. Hardlinks keep this at
 * effectively zero extra bytes while giving Nokta one flat tree to read.
 */
export async function buildIndex({ sourceRoot, indexRoot, dryRun = false }) {
  const { skills, stats, candidates, sourceExcluded } = await discoverSkills(sourceRoot);

  if (!dryRun) await fs.rm(indexRoot, { recursive: true, force: true });

  const placements = [];
  const collisions = [];
  for (const skill of skills) {
    const relative = path.join(skill.collection, skill.name);
    const dest = path.join(indexRoot, relative);
    if (placements.some((p) => p.relative === relative)) {
      collisions.push(relative);
      continue;
    }
    if (!dryRun) await linkTree(skill.dir, dest);
    placements.push({ relative, name: skill.name, collection: skill.collection, source: skill.file });
  }

  return {
    indexRoot,
    candidates,
    unique: skills.length,
    placements,
    collisions,
    excludedSources: sourceExcluded,
    stats,
  };
}
