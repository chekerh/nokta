import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, walkFiles, toPosix } from './utils.mjs';

export const NOKTA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PACK_REQUIRED_FIELDS = [
  'id',
  'version',
  'kind',
  'title',
  'summary',
  'priority',
  'tokenCost',
  'triggers',
  'instructions',
];

export function validatePack(pack) {
  const errors = [];
  for (const field of PACK_REQUIRED_FIELDS) {
    if (!(field in pack)) errors.push(`Missing required field: ${field}`);
  }
  if (pack.kind !== 'policy' && pack.kind !== 'capability') {
    errors.push('kind must be policy or capability');
  }
  if (!Array.isArray(pack.instructions) || pack.instructions.length === 0) {
    errors.push('instructions must be a non-empty array');
  }
  if (!Number.isInteger(pack.priority)) errors.push('priority must be an integer');
  if (!Number.isInteger(pack.tokenCost)) errors.push('tokenCost must be an integer');
  if (!pack.triggers || typeof pack.triggers !== 'object') errors.push('triggers must be an object');
  return errors;
}

export function loadPacks(root = NOKTA_ROOT) {
  const packRoot = path.join(root, 'packs');
  return walkFiles(packRoot)
    .filter((file) => file.endsWith('.pack.json'))
    .map((file) => {
      const absolutePath = path.join(packRoot, file);
      const pack = readJson(absolutePath);
      const errors = validatePack(pack);
      if (errors.length > 0) {
        throw new Error(`${absolutePath} is invalid:\n${errors.join('\n')}`);
      }
      return { ...pack, path: toPosix(path.relative(root, absolutePath)) };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function loadAdapter(adapterId, root = NOKTA_ROOT) {
  const adapterPath = path.join(root, 'adapters', adapterId, 'adapter.json');
  if (!fs.existsSync(adapterPath)) {
    const available = fs
      .readdirSync(path.join(root, 'adapters'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .join(', ');
    throw new Error(`Unknown adapter "${adapterId}". Available adapters: ${available}`);
  }
  return readJson(adapterPath);
}

function hasPrefix(files, prefix) {
  const needle = prefix.toLowerCase().replace(/\/$/, '');
  return files.some((file) => file.toLowerCase().startsWith(`${needle}/`));
}

function hasExtension(files, extension) {
  const needle = extension.toLowerCase();
  return files.some((file) => file.toLowerCase().endsWith(needle));
}

function patternMatchesFile(files, pattern) {
  const candidateFiles = files.filter((file) => {
    const lower = file.toLowerCase();
    return (
      !lower.endsWith('.pack.json') &&
      !lower.endsWith('.agent.json') &&
      !lower.endsWith('.schema.json') &&
      !lower.endsWith('/adapter.json')
    );
  });
  const normalized = pattern.toLowerCase();
  if (normalized.endsWith('/')) return hasPrefix(candidateFiles, normalized);
  if (normalized.startsWith('.')) return hasExtension(candidateFiles, normalized);
  return candidateFiles.some((file) => file.toLowerCase().includes(normalized));
}

export function scorePack(pack, detected, task = '') {
  if (pack.required) {
    return { score: 1000 + pack.priority, reasons: ['required'] };
  }
  const reasons = [];
  let score = 0;
  const taskText = task.toLowerCase();
  const triggers = pack.triggers ?? {};

  for (const stack of triggers.stacks ?? []) {
    if (detected.stacks.includes(stack)) {
      score += 50;
      reasons.push(`stack:${stack}`);
    }
  }
  for (const taskType of triggers.taskTypes ?? []) {
    if (taskType === 'all') continue;
    if (taskText.includes(taskType)) {
      score += 35;
      reasons.push(`task:${taskType}`);
    }
  }
  for (const keyword of triggers.keywords ?? []) {
    if (taskText.includes(keyword.toLowerCase())) {
      score += 25;
      reasons.push(`keyword:${keyword}`);
    }
  }
  for (const filePattern of triggers.files ?? []) {
    if (patternMatchesFile(detected.files, filePattern)) {
      score += 20;
      reasons.push(`file:${filePattern}`);
    }
  }
  if (score > 0) {
    score += pack.priority / 10;
    if ((triggers.taskTypes ?? []).includes('all')) reasons.push('task:all');
  }
  return { score, reasons };
}

export function selectPacks({ packs, detected, task = 'general', budget = 6000 }) {
  const scored = packs
    .map((pack) => ({ pack, ...scorePack(pack, detected, task) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.pack.priority - a.pack.priority || a.pack.id.localeCompare(b.pack.id));

  const selected = [];
  let usedBudget = 0;

  for (const entry of scored) {
    const mustInclude = Boolean(entry.pack.required);
    const wouldFit = usedBudget + entry.pack.tokenCost <= budget;
    if (mustInclude || wouldFit) {
      selected.push(entry);
      usedBudget += entry.pack.tokenCost;
    }
  }

  return { selected, usedBudget, budget };
}
