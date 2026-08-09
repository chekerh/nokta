#!/usr/bin/env node
import { AgentOrchestrator } from './orchestrator.mjs';
import { ProviderManager } from '../lib/provider-manager.mjs';
import { ChatHandler } from '../lib/chat-handler.mjs';
import { logger } from '../lib/logger.mjs';

const log = logger.child({ service: 'job-worker' });

async function main() {
  const runId = process.env.NOKTA_JOB_RUN_ID;
  const projectRoot = process.env.NOKTA_JOB_PROJECT_ROOT || process.cwd();
  const timeout = parseInt(process.env.NOKTA_JOB_TIMEOUT || '300000', 10);

  if (!runId) {
    console.error('NOKTA_JOB_RUN_ID not set');
    process.exit(1);
  }

  log.info(`Worker started for run: ${runId}`);

  const providerManager = new ProviderManager({ log });
  await providerManager.initDefaults();

  const chatHandler = new ChatHandler(providerManager, { projectRoot, log });
  const orchestrator = new AgentOrchestrator(projectRoot, { log, providerManager, chatHandler });

  try {
    const result = await Promise.race([
      orchestrator.executeRun(runId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Job timeout')), timeout)),
    ]);

    // Output progress as JSON lines for the parent process
    console.log(JSON.stringify({ type: 'job:completed', data: { runId, result } }));
    log.info(`Worker completed run: ${runId}`);
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ type: 'job:failed', data: { runId, error: err.message } }));
    log.error(`Worker failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
