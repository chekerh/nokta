#!/usr/bin/env node
import path from 'node:path';
import { compileContext, parseArgs, writeCompiledContext } from './lib/nokta.mjs';

const args = parseArgs(process.argv.slice(2));
const target = path.resolve(args.target ?? process.cwd());
const adapter = args.adapter ?? 'codex';
const task = args.task ?? 'general software engineering task';
const budget = args.budget ?? '6000';

try {
  const result = compileContext({ target, adapter, task, budget });

  if (args.out) {
    const outputPath = path.resolve(args.out);
    writeCompiledContext(outputPath, result.markdown);
    console.log(`Wrote compiled context to ${outputPath}`);
  } else if (args.json) {
    console.log(JSON.stringify(result.metadata, null, 2));
  } else {
    console.log(result.markdown);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
