import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadAdapter, loadPacks, selectPacks, NOKTA_ROOT } from './packs.mjs';
import { detectProject } from './detect.mjs';

const contextCache = new Map();
const CACHE_TTL = 30_000; // 30 seconds

export function renderCompiledContext({ adapter, detected, selection, task, target }) {
  const lines = [
    '# Nokta Compiled Context',
    '',
    `Adapter: ${adapter.title}`,
    `Target: ${target}`,
    `Task: ${task}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Detected Project',
    '',
    `Stacks: ${detected.stacks.length ? detected.stacks.join(', ') : 'unknown'}`,
    `Package managers: ${detected.packageManagers.length ? detected.packageManagers.join(', ') : 'none detected'}`,
    '',
    '## Mandatory Workflow',
    '',
    '- Follow Orient -> Plan -> Act -> Verify -> Record -> Handoff.',
    '- Use visible engineering notes in the trail: hypothesis, evidence, decision, risk, next action.',
    '- Do not expose hidden chain-of-thought.',
    '- Load minimal context and expand only when evidence requires it.',
    '- Update `.ai/trail/index.md` and the active session file before final handoff.',
    '',
    '## Adapter Rules',
    '',
    ...adapter.rules.map((rule) => `- ${rule}`),
    '',
    '## Selected Packs',
    '',
  ];

  for (const { pack, reasons } of selection.selected) {
    lines.push(`### ${pack.title} (${pack.id})`);
    lines.push('');
    lines.push(`Reason: ${reasons.join(', ')}`);
    lines.push(`Token cost: ${pack.tokenCost}`);
    lines.push('');
    lines.push('Instructions:');
    for (const instruction of pack.instructions) {
      lines.push(`- ${instruction}`);
    }
    if (pack.evidenceRequirements?.length) {
      lines.push('');
      lines.push('Evidence required:');
      for (const requirement of pack.evidenceRequirements) lines.push(`- ${requirement}`);
    }
    if (pack.gates?.length) {
      lines.push('');
      lines.push(`Gates: ${pack.gates.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Handoff Requirement');
  lines.push('');
  lines.push(
    'Before claiming completion, update the active trail with validation status, residual risk, next action, and handoff summary.',
  );
  lines.push('');
  lines.push(`Context budget used: ${selection.usedBudget}/${selection.budget}`);
  lines.push('');

  return lines.join('\n');
}

export function writeCompiledContext(outputPath, markdown) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, 'utf8');
}

function makeCacheKey(target, task, adapterId, budget) {
  const hash = createHash('md5').update(`${target}|${task}|${adapterId}|${budget}`).digest('hex');
  return hash;
}

export function compileContext(options = {}) {
  const root = options.root ?? NOKTA_ROOT;
  const target = path.resolve(options.target ?? process.cwd());
  const adapterId = options.adapter ?? 'codex';
  const task = options.task ?? 'general software engineering task';
  const budget = Number.parseInt(options.budget ?? '6000', 10);

  const cacheKey = makeCacheKey(target, task, adapterId, budget);
  const cached = contextCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.result;
  }

  const adapter = loadAdapter(adapterId, root);
  const detected = detectProject(target);
  const packs = loadPacks(root);
  const selection = selectPacks({ packs, detected, task, budget });

  const result = {
    metadata: {
      generatedAt: new Date().toISOString(),
      adapter: adapter.id,
      target,
      task,
      budget,
      detected: {
        stacks: detected.stacks,
        files: detected.files.slice(0, 200),
        packageManagers: detected.packageManagers,
      },
      packs: selection.selected.map(({ pack }) => ({
        id: pack.id,
        title: pack.title,
        kind: pack.kind,
        tokenCost: pack.tokenCost,
      })),
    },
    markdown: renderCompiledContext({ adapter, detected, selection, task, target }),
  };

  contextCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}
