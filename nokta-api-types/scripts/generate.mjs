#!/usr/bin/env node
/**
 * Generate TypeScript types from Nokta Daemon OpenAPI spec
 * Usage: node scripts/generate.mjs [--output=path] [--version=x.y.z]
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DAEMON_LIB = resolve(ROOT, '../daemon/lib/openapi.mjs');
const OUTPUT_DIR = resolve(ROOT, 'src');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'api-types.ts');

function getVersion() {
  const args = process.argv.slice(2);
  const versionArg = args.find(a => a.startsWith('--version='));
  return versionArg ? versionArg.split('=')[1] : '0.2.0';
}

function getOutputPath() {
  const args = process.argv.slice(2);
  const outputArg = args.find(a => a.startsWith('--output='));
  return outputArg ? resolve(outputArg.split('=')[1]) : OUTPUT_FILE;
}

async function main() {
  const version = getVersion();
  const outputPath = getOutputPath();

  console.log(`Generating TypeScript types for Nokta API v${version}...`);

  // Load the OpenAPI spec from daemon
  let spec;
  try {
    const openapiModule = await import(DAEMON_LIB);
    spec = openapiModule.getOpenApiSpec(version);
    console.log(`Loaded OpenAPI spec from ${DAEMON_LIB}`);
  } catch (e) {
    console.error(`Failed to load OpenAPI spec: ${e.message}`);
    process.exit(1);
  }

  // Write spec to temp file for openapi-typescript
  const tempSpecPath = resolve(ROOT, '.openapi-temp.json');
  writeFileSync(tempSpecPath, JSON.stringify(spec, null, 2));
  console.log(`Wrote temp spec to ${tempSpecPath}`);

  // Generate TypeScript types using openapi-typescript
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const cmd = `npx openapi-typescript ${tempSpecPath} -o ${outputPath} --export-type`;
    console.log(`Running: ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: ROOT });

    console.log(`✅ Types generated at ${outputPath}`);
  } catch (e) {
    console.error(`Generation failed: ${e.message}`);
    process.exit(1);
  } finally {
    // Cleanup
    try { import('fs').then(fs => fs.unlinkSync(tempSpecPath)); } catch {}
  }

}

main();
