#!/usr/bin/env node
/**
 * Convert agency-agents personas into Nokta agent packs.
 *
 * The source (~/skills/agency-agents) is a catalogue of specialist personas.
 * Each one is a markdown file with frontmatter (name, description, color,
 * emoji, vibe) and a body holding the identity, mission, critical rules and
 * deliverables that make the persona behave like itself.
 *
 * Nokta's agent loader (daemon/routes/agents.mjs) does a flat readdir of
 * agents/ and keeps every *.agent.json, with no schema validation. So the
 * output is written flat, one file per persona.
 *
 * Only fields that can be derived truthfully from the source are populated.
 * inputs/outputs/handoff/cannotDo are hand-authored in Nokta's own agents and
 * are deliberately left out rather than invented.
 *
 * Usage:
 *   node scripts/convert-agency-agents.mjs [--source DIR] [--out agents] [--dry-run]
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Non-division directories per the source's own scripts/check-divisions.sh.
// integrations/ holds conversion OUTPUTS, strategy/ holds playbooks with no
// agent frontmatter; examples/ and scripts/ are documentation and tooling.
const NON_DIVISION_DIRS = new Set(['examples', 'scripts', 'integrations', 'strategy']);

// Nokta's own hand-authored agents. Never overwrite these: they are part of
// the running loop, and a persona with the same filename is a coincidence.
const RESERVED = new Set([
  'designer',
  'implementer',
  'orchestrator',
  'planner',
  'researcher',
  'reviewer',
  'security-auditor',
  'trailkeeper',
  'verifier',
]);

const SECTION_PATTERNS = {
  coreMission: /^##\s+.*core\s+mission/i,
  coreCapabilities: /^##\s+.*(?:core\s+(?:capabilities|competencies)|advanced\s+capabilities|domain\s+expertise|specialized\s+skills)/i,
  criticalRules: /^##\s+.*critical\s+rules/i,
  notForUse: /^##\s+.*when\s+not\s+to\s+use/i,
  deliverables: /^##\s+.*(?:deliverable|required\s+output\s+format)/i,
};

// "- item", "* item", "+ item", "1. item", "2) item"
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/;
// Strip the markdown emphasis these personas wrap headings-in in.
function tidy(text) {
  return text
    .replace(/`/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/, '')
    .trim();
}

const PROHIBITION = /\b(never|don'?t|do not|avoid|no\b|without|forbidden|prohibited)\b/i;

export function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = content.slice(3, end);
  const meta = {};
  let key = null;
  for (const raw of block.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      meta[key] = kv[2].trim();
      continue;
    }
    // Continuation of a multi-line value.
    if (key && /^\s+\S/.test(raw)) {
      meta[key] = `${meta[key]} ${line.trim()}`.trim();
    }
  }
  for (const k of Object.keys(meta)) {
    const v = meta[k];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      meta[k] = v.slice(1, -1);
    }
  }
  return meta;
}

/**
 * Pull the content under the first "## " heading matching any of the given
 * patterns. Prefers list items (bulleted or numbered); when a section is
 * written as prose instead, falls back to its opening sentences so the field
 * is still populated from the source rather than left empty.
 */
export function extractItems(body, patterns, { limit = 10, prose = true } = {}) {
  const lines = body.split('\n');
  const found = [];
  let items = [];
  let proseLines = [];
  let active = false;

  const flush = () => {
    if (!active) return;
    if (items.length) {
      found.push(...items.slice(0, limit));
      return;
    }
    if (!prose) return;
    const text = proseLines
      .map(tidy)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Split the opening sentences so scope reads as a list, not one blob.
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    found.push(...sentences);
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      active = patterns.some((p) => p.test(line));
      items = [];
      proseLines = [];
      continue;
    }
    if (!active) continue;
    if (/^[-*_]{3,}$/.test(line.trim())) continue;
    const m = line.match(LIST_ITEM);
    if (m) {
      const text = tidy(m[1]);
      if (text) items.push(text);
    } else if (line.trim()) {
      proseLines.push(line);
    }
  }
  flush();
  return [...new Set(found)].slice(0, limit);
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function convertPersona({ file, sourceRoot, division, divisionInfo, body, meta }) {
  const relative = path.relative(sourceRoot, file);
  const slug = slugify(meta.name || path.basename(file, '.md'));
  const mission = extractItems(body, [SECTION_PATTERNS.coreMission]);
  const capabilities = extractItems(body, [SECTION_PATTERNS.coreCapabilities]);
  const scope = mission.length ? mission : capabilities;
  const criticalRules = extractItems(body, [SECTION_PATTERNS.criticalRules]);
  const notForUse = extractItems(body, [SECTION_PATTERNS.notForUse]);
  const deliverables = extractItems(body, [SECTION_PATTERNS.deliverables]);

  const agent = {
    id: `agent.${division}.${slug}`,
    version: '0.1.0',
    title: meta.name,
    role: meta.description,
    division,
    divisionLabel: divisionInfo.label,
    divisionIcon: divisionInfo.icon,
    divisionColor: divisionInfo.color,
    // Derived from the persona's own sections, never invented.
    scope: scope,
    // The source states no input contract, so this stays empty rather than
    // being filled with a plausible-sounding invention.
    inputs: [],
    outputs: deliverables,
    handoff: [],
  };
  if (meta.emoji) agent.emoji = meta.emoji;
  if (meta.vibe) agent.vibe = meta.vibe;
  if (criticalRules.length) agent.criticalRules = criticalRules;
  // cannotDo is for prohibitions specifically. Two real sources: the negative
  // clauses in "Critical Rules", and the personas' own explicit
  // "When Not To Use This Agent" section, which states the limits outright.
  const prohibitions = [
    ...notForUse,
    ...criticalRules.filter((r) => PROHIBITION.test(r)),
  ];
  if (prohibitions.length) agent.cannotDo = [...new Set(prohibitions)];
  agent.instructions = body.trim();
  agent.source = relative;

  return { agent, slug, relative };
}

export async function convertAll({ sourceRoot, outDir, dryRun = false }) {
  const divisionsJson = JSON.parse(
    await fs.readFile(path.join(sourceRoot, 'divisions.json'), 'utf8'),
  );
  const divisions = divisionsJson.divisions;

  const written = [];
  const skipped = [];
  const collisions = [];

  for (const division of Object.keys(divisions)) {
    if (NON_DIVISION_DIRS.has(division)) continue;
    const dir = path.join(sourceRoot, division);
    let entries;
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      if (!entry.endsWith('.md')) continue;
      const file = path.join(dir, entry);
      const raw = await fs.readFile(file, 'utf8');
      const meta = parseFrontmatter(raw);
      if (!meta || !meta.name || !meta.description) {
        skipped.push({ file: path.relative(sourceRoot, file), reason: 'no frontmatter name/description' });
        continue;
      }
      const end = raw.indexOf('\n---', 3);
      const body = end === -1 ? raw : raw.slice(end + 4);

      const { agent, slug } = await convertPersona({
        file,
        sourceRoot,
        division,
        divisionInfo: divisions[division],
        body,
        meta,
      });
      const base = `${division}-${slug}`;
      if (RESERVED.has(base)) {
        skipped.push({ file: path.relative(sourceRoot, file), reason: `reserved Nokta agent name "${base}"` });
        continue;
      }
      const target = path.join(outDir, `${base}.agent.json`);
      if (written.some((w) => w.file === path.basename(target))) {
        collisions.push(base);
        continue;
      }
      // Never clobber anything already in agents/. Nokta's own hand-authored
      // agents live here too, and a persona that happens to land on the same
      // filename must not silently replace a working loop component. This is
      // the real guard; RESERVED only documents the known names.
      const exists = await fs.access(target).then(
        () => true,
        () => false,
      );
      if (exists) {
        skipped.push({ file: path.relative(sourceRoot, file), reason: `"${base}.agent.json" already exists` });
        continue;
      }
      if (!dryRun) await fs.writeFile(target, `${JSON.stringify(agent, null, 2)}\n`);
      written.push({ file: path.basename(target), name: agent.title, division });
    }
  }

  return { written, skipped, collisions };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const sourceRoot = arg('--source', path.join(process.env.HOME, 'skills', 'agency-agents'));
  const outDir = arg('--out', path.resolve(process.cwd(), 'agents'));
  const dryRun = argv.includes('--dry-run');

  const { written, skipped, collisions } = await convertAll({ sourceRoot, outDir, dryRun });

  const byDivision = {};
  for (const w of written) byDivision[w.division] = (byDivision[w.division] || 0) + 1;

  console.log(`source : ${sourceRoot}`);
  console.log(`output : ${outDir}${dryRun ? '  (dry run)' : ''}`);
  console.log(`\nconverted: ${written.length}`);
  for (const [d, c] of Object.entries(byDivision).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(c).padStart(4)}  ${d}`);
  }
  if (skipped.length) {
    console.log(`\nskipped: ${skipped.length}`);
    for (const s of skipped) console.log(`  ${s.file}  (${s.reason})`);
  }
  if (collisions.length) {
    console.log(`\nname collisions: ${collisions.length}`);
    for (const c of collisions) console.log(`  ${c}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
