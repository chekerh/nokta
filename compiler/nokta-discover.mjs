#!/usr/bin/env node

async function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === 'discover') continue;
    if (process.argv[i] === '--force' || process.argv[i] === '-f') args.force = true;
  }

  try {
    const { runDiscovery } = await import('../daemon/lib/discovery.mjs');

    console.log('\n  \u{1f50d} Nokta Web Discovery\n');

    if (args.force) {
      console.log('  Forcing fresh scan (this may take 15-30 seconds)...\n');
    } else {
      console.log('  Checking cached results (use --force for fresh scan)...\n');
    }

    const report = await runDiscovery(!!args.force);

    if (!report || !report.discoveries) {
      console.log('  No discovery results available.\n');
      return;
    }

    const updates = report.discoveries.filter((d) => d.type === 'update');
    const github = report.discoveries.filter((d) => d.type === 'github');
    const npm = report.discoveries.filter((d) => d.type === 'npm');

    console.log(`  Generated: ${new Date(report.generatedAt).toLocaleString()}`);
    console.log(`  Total: ${report.summary.totalDiscovery} items`);
    console.log(`    GitHub repos: ${report.summary.githubRepos}`);
    console.log(`    npm packages: ${report.summary.npmPackages}`);
    console.log(`    Source updates: ${report.summary.sourceUpdates}`);
    console.log();

    if (updates.length > 0) {
      console.log(`  \u26a0 Source Updates (${updates.length}):`);
      for (const u of updates) {
        console.log(`    ${u.name} — ${u.newCommits || 0} new commits`);
        console.log(`      ${u.url}`);
      }
      console.log();
    }

    if (github.length > 0) {
      console.log(`  GitHub Trending (${github.length}):`);
      for (const r of github.slice(0, 15)) {
        console.log(`    ${r.stars.toLocaleString().padStart(8)} \u2b50  ${r.name}`);
        console.log(`    ${(r.description || '').slice(0, 90)}`);
        console.log();
      }
    }

    if (npm.length > 0) {
      console.log(`  npm Packages (${npm.length}):`);
      for (const p of npm.slice(0, 10)) {
        console.log(`    ${p.name}`);
        console.log(`    ${(p.description || '').slice(0, 90)}`);
        console.log();
      }
    }

    console.log('  Run \x1b[36mnokta skill import <url>\x1b[0m to import any of the above into Nokta.\n');
    console.log('  Or open the dashboard: \x1b[36mnokta ui\x1b[0m\n');
  } catch (err) {
    console.error('  Discovery failed:', err.message);
    process.exit(1);
  }
}

main();
