#!/usr/bin/env node
import path from 'node:path';
import { evaluateUiGates } from './lib/ui-gates.mjs';
import { formatGateResults, hasGateFailures, parseArgs } from './lib/nokta.mjs';

const args = parseArgs(process.argv.slice(2));
const target = path.resolve(args.target ?? process.cwd());
const results = evaluateUiGates(target);

if (args.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(formatGateResults(results));
}

if (hasGateFailures(results)) {
  process.exit(1);
}
