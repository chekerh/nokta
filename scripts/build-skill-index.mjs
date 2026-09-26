#!/usr/bin/env node
import path from 'node:path';
import os from 'node:os';
import { buildIndex, discoverSkills, EXCLUDED_SOURCES } from '../daemon/workspace/skill-index.mjs';

const sourceRoot = process.env.NOKTA_SOURCE_SKILLS_DIR || path.join(os.homedir(), 'skills');
const indexRoot = process.env.NOKTA_SKILLS_DIR || path.join(os.homedir(), 'nokta-skills-index');
const dryRun = process.argv.includes('--dry-run');
const showAll = process.argv.includes('--all');

const { skills, stats, candidates, sourceExcluded } = await discoverSkills(sourceRoot);

console.log(`source : ${sourceRoot}`);
console.log(`index  : ${indexRoot}${dryRun ? '  (dry run, nothing written)' : ''}`);
console.log(`candidates ${candidates}  ->  unique ${skills.length}`);
console.log(
  `dropped: ${stats.noFrontmatter} no-frontmatter, ${stats.noName} no-name, ${stats.noDescription} no-description`,
);

const byCollection = new Map();
for (const skill of skills) byCollection.set(skill.collection, (byCollection.get(skill.collection) || 0) + 1);
console.log('\nby collection:');
for (const [name, count] of [...byCollection].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${name}`);
}

if (sourceExcluded.length && showAll) {
  console.log('\nexcluded sources:');
  for (const item of sourceExcluded.filter((i) => EXCLUDED_SOURCES[path.basename(i.path)])) {
    console.log(`  ${path.relative(sourceRoot, i.path)}  ${EXCLUDED_SOURCES[path.basename(i.path)]}`);
  }
}

if (dryRun) {
  console.log('\ndry run — re-run without --dry-run to write the index');
  process.exit(0);
}

const result = await buildIndex({ sourceRoot, indexRoot });
console.log(`\nwrote ${result.placements.length} skills to ${result.indexRoot}`);
if (result.collisions.length) {
  console.log(`WARNING: ${result.collisions.length} name collisions skipped:`);
  for (const c of result.collisions) console.log(`  ${c}`);
}
console.log(`\npoint Nokta at it with: export NOKTA_SKILLS_DIR=${result.indexRoot}`);
