#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function initProject(target) {
  const trailDir = path.join(target, '.ai', 'trail');
  const sessionsDir = path.join(trailDir, 'sessions');

  fs.mkdirSync(sessionsDir, { recursive: true });

  const indexPath = path.join(trailDir, 'index.md');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(
      indexPath,
      `# Nokta Trail Index

Active session: none

## Recent Sessions

- none yet

## Rules

- Read this index before work.
- Open the active session before making claims or edits.
- Update the active session after every material step.
- Before handoff, ensure validation status and next action are current.
`,
      'utf8',
    );
    console.log('Created .ai/trail/index.md');
  } else {
    console.log('.ai/trail/index.md already exists');
  }

  const noktaDir = path.join(target, '.nokta');
  const configPath = path.join(noktaDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(noktaDir, { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          version: '0.2.0',
          logLevel: 'info',
          cors: { origin: '*' },
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log('Created .nokta/config.json');
  } else {
    console.log('.nokta/config.json already exists');
  }

  return trailDir;
}

function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === 'init') continue;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = process.argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }

  const target = path.resolve(args.target || process.cwd());
  initProject(target);
  console.log(`Nokta initialized at ${target}`);
}

main();
