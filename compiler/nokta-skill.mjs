#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..');
const CACHE_DIR = process.env.NOKTA_DATA_DIR
  ? path.join(process.env.NOKTA_DATA_DIR, 'repo-cache')
  : path.join(ROOT, '.nokta', 'repo-cache');

function showHelp() {
  console.log(`Nokta Skill Manager

Usage: nokta skill <command> [options]

Commands:
  scan <url>     Scan a GitHub repo for skills, agents, packs
  import <url>   Scan and import into Nokta
  list           List cached skill sources
  help           Show this help

Examples:
  nokta skill scan https://github.com/affaan-m/ECC
  nokta skill import https://github.com/affaan-m/UI-UX-Pro-Max
  nokta skill list`);
}

function parseArgs(argv) {
  const cmd = argv[3];
  const args = { cmd, url: argv[4] };
  return args;
}

async function main() {
  const { cmd, url } = parseArgs(process.argv);

  if (!cmd || cmd === 'help') {
    showHelp();
    return;
  }

  if (cmd === 'list') {
    const cachePath = path.join(ROOT, '.nokta', 'skill-sources.json');
    if (!fs.existsSync(cachePath)) {
      console.log('No cached skill sources. Run nokta skill scan <url> first.');
      return;
    }
    const sources = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (sources.length === 0) {
      console.log('No skill sources cached.');
      return;
    }
    console.log(`Cached Skill Sources (${sources.length}):\n`);
    sources.forEach((s) => {
      console.log(`  ${s.name || s.url}`);
      console.log(`    Skills: ${s.skills || 0}  Agents: ${s.agents || 0}  Packs: ${s.packs || 0}`);
      console.log(`    Commands: ${s.commands || 0}  MCP: ${s.mcpConfigs || 0}  Files: ${s.totalFiles || 0}`);
      console.log();
    });
    return;
  }

  if (cmd === 'scan' || cmd === 'import') {
    if (!url) {
      console.error('Error: URL required');
      showHelp();
      process.exit(1);
    }

    console.log(`\n  Scanning ${url}...\n`);

    const cacheDir = CACHE_DIR;
    const repoDir = path.join(
      cacheDir,
      url
        .split('/')
        .pop()
        .replace(/\.git$/, ''),
    );
    if (!fs.existsSync(repoDir)) {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      console.log('  Cloning repository...');
      execSync(`git clone --depth 1 "${url}" "${repoDir}"`, { stdio: 'inherit', timeout: 120000 });
    } else {
      console.log('  Repository already cached, pulling latest...');
      try {
        execSync(`cd "${repoDir}" && git pull --ff-only`, { stdio: 'pipe', timeout: 30000 });
      } catch {}
    }

    const skillsDir = path.join(repoDir, 'skills');
    const agentsDir = path.join(repoDir, 'agents');
    const commandsDir = path.join(repoDir, 'commands');
    const rulesDir = path.join(repoDir, 'rules');

    const countDirs = (d) => {
      if (!fs.existsSync(d)) return 0;
      let c = 0;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) {
          c++;
          c += countDirs(path.join(d, e.name));
        }
      }
      return c;
    };
    const countFiles = (d, ext) => {
      if (!fs.existsSync(d)) return 0;
      let c = 0;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) c += countFiles(full, ext);
        else if (ext ? e.name.endsWith(ext) : true) c++;
      }
      return c;
    };

    const skills = countDirs(skillsDir);
    const agents = countFiles(agentsDir, '.json') + countFiles(agentsDir, '.md');
    const commands = countFiles(commandsDir, '.md');
    const rules = countFiles(rulesDir, '.md');

    console.log(`  Results for ${url.split('/').pop()}:\n`);
    console.log(`    Skills:   ${skills}`);
    console.log(`    Agents:   ${agents}`);
    console.log(`    Commands: ${commands}`);
    console.log(`    Rules:    ${rules}`);
    console.log();

    if (cmd === 'import') {
      const noktaAgents = path.join(ROOT, 'agents');
      const noktaPacks = path.join(ROOT, 'packs', 'sources');

      if (!fs.existsSync(noktaPacks)) fs.mkdirSync(noktaPacks, { recursive: true });

      let imported = 0;
      if (fs.existsSync(agentsDir)) {
        for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
          if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.md'))) {
            const dst = path.join(noktaAgents, `imported-${entry.name}`);
            if (!fs.existsSync(dst)) {
              fs.copyFileSync(path.join(agentsDir, entry.name), dst);
              imported++;
            }
          }
        }
      }

      const packName = url
        .split('/')
        .pop()
        .replace(/\.git$/, '')
        .toLowerCase();
      const packPath = path.join(noktaPacks, `source-${packName}.pack.json`);
      if (!fs.existsSync(packPath)) {
        fs.writeFileSync(
          packPath,
          JSON.stringify(
            {
              id: `source.${packName}`,
              version: '0.1.0',
              kind: 'reference',
              title: `Source: ${packName}`,
              summary: `Imported from ${url}. ${skills} skills, ${agents} agents.`,
              priority: 30,
              tokenCost: 100,
              required: false,
              triggers: { stacks: [], taskTypes: [], files: [], keywords: [] },
              appliesTo: ['all'],
              instructions: [
                `Repository: ${url}`,
                `Local path: ${repoDir}`,
                `Contains ${skills} skill directories and ${agents} agent definitions.`,
              ],
              evidenceRequirements: ['Check the repo for relevant skills'],
              gates: [],
              sourceRefs: [url, repoDir],
            },
            null,
            2,
          ),
        );
      }

      console.log(`  Imported ${imported} agent definitions.`);
      console.log(`  Reference pack created at packs/sources/source-${packName}.pack.json`);
      console.log();
      console.log('  Run the daemon and open the dashboard to manage skills visually:');
      console.log('    nokta ui');
    }

    return;
  }

  console.error(`Unknown skill command: ${cmd}`);
  showHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
