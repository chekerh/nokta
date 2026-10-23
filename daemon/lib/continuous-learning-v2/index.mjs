#!/usr/bin/env node
// Continuous Learning v2 - Nokta Integration
// Project-scoped instincts and hook setup for Nokta daemon

import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as crypto from 'node:crypto';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export async function setupContinuousLearningV2({ projectRoot, log }) {
  const homeDir = os.homedir();
  const claudeDir = path.join(homeDir, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const settingsPath = path.join(claudeDir, 'settings.json');

  await fs.mkdir(hooksDir, { recursive: true });

  const hookDest = path.join(hooksDir, 'observe.sh');
  await fs.copyFile(path.join(__dirname, 'hooks', 'observe.sh'), hookDest);
  await fs.chmod(hookDest, 0o755);

  const hookConfig = {
    PreToolUse: [
      {
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command: '~/.config/opencode/skills/continuous-learning-v2/hooks/observe.sh',
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command: '~/.config/opencode/skills/continuous-learning-v2/hooks/observe.sh',
          },
        ],
      },
    ],
  };

  let settingsExists = false;
  let settingsContent = '{}';
  try {
    await fs.access(settingsPath);
    settingsExists = true;
    settingsContent = await fs.readFile(settingsPath, 'utf8');
  } catch {}

  if (settingsExists) {
    try {
      const existingSettings = JSON.parse(settingsContent);
      const hasHooks = existingSettings.hooks &&
        (existingSettings.hooks.PreToolUse || existingSettings.hooks.PostToolUse);
      if (!hasHooks) {
        const merged = {
          ...existingSettings,
          hooks: {
            PreToolUse: hookConfig.PreToolUse,
            PostToolUse: hookConfig.PostToolUse,
          },
        };
        await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2));
      }
    } catch {
      await fs.writeFile(settingsPath, JSON.stringify(hookConfig, null, 2));
    }
  } else {
    await fs.writeFile(settingsPath, JSON.stringify(hookConfig, null, 2));
  }

  const clv2DataDir = path.join(projectRoot, '.clv2');
  const instinctsDir = path.join(clv2DataDir, 'instincts');
  const observationsDir = path.join(clv2DataDir, 'observations');
  const evolvedDir = path.join(clv2DataDir, 'evolved');

  await fs.mkdir(instinctsDir, { recursive: true });
  await fs.mkdir(observationsDir, { recursive: true });
  await fs.mkdir(evolvedDir, { recursive: true });

  const instinctsPersonalDir = path.join(instinctsDir, 'personal');
  await fs.mkdir(instinctsPersonalDir, { recursive: true });

  const projectsRegistryPath = path.join(clv2DataDir, 'projects.json');
  let projectsRegistry = { projects: [] };
  try {
    await fs.access(projectsRegistryPath);
    projectsRegistry = JSON.parse(await fs.readFile(projectsRegistryPath, 'utf8'));
  } catch {}

  const projectHash = hashProjectPath(projectRoot);
  const projectName = path.basename(path.resolve(projectRoot));

  const projectExists = projectsRegistry.projects.some(
    (p) => p.hash === projectHash || p.name === projectName,
  );

  if (!projectExists) {
    projectsRegistry.projects.push({
      hash: projectHash,
      name: projectName,
      root: projectRoot,
      instinctsEnabled: true,
    });
    await fs.writeFile(projectsRegistryPath, JSON.stringify(projectsRegistry, null, 2));
  }

  const configPath = path.join(clv2DataDir, 'config.json');
  let configExists = false;
  try {
    await fs.access(configPath);
    configExists = true;
  } catch {}

  if (!configExists) {
    await fs.writeFile(configPath, JSON.stringify({
      version: '2.1.0',
      observer: {
        enabled: true,
        run_interval_minutes: 5,
        min_observations_to_analyze: 20,
      },
    }, null, 2));
  }

  log.info(`CLV2 setup complete for project ${projectName}`);
}

function hashProjectPath(projectRoot) {
  const h = crypto.createHash('sha256');
  h.update(path.normalize(projectRoot).toLowerCase());
  return h.digest('hex').substring(0, 12);
}

// Export helper for use by observe.sh hook integration
export { hashProjectPath };
