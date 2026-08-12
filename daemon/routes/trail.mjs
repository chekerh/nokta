import { authMiddleware } from '../lib/auth.mjs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { asyncHandler, AppError } from '../lib/route-utils.mjs';

function getTrailDir(target) {
  return path.join(target || process.cwd(), '.ai', 'trail');
}

function getIndexPath(target) {
  return path.join(getTrailDir(target), 'index.md');
}

function getSessionsDir(target) {
  return path.join(getTrailDir(target), 'sessions');
}

async function readOrCreateIndex(target) {
  const indexPath = getIndexPath(target);
  const dir = getTrailDir(target);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
  try {
    return await fs.readFile(indexPath, 'utf8');
  } catch {
    const content = '# Trail Index\n\nActive session: none\n\n## Recent Sessions\n\n- none yet\n';
    await fs.writeFile(indexPath, content, 'utf8');
    return content;
  }
}

export function registerTrailRoutes(app) {
  app.get(
    '/api/v1/trail',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { target } = req.query;
      const indexContent = await readOrCreateIndex(target);
      const match = indexContent.match(/Active session:\s*`?([^`\n]+)`?/i);
      const activeSession = match?.[1]?.trim() || null;

      let sessionContent = null;
      if (activeSession) {
        const sessionPath = path.resolve(getTrailDir(target), activeSession.replace('.ai/trail/', ''));
        try {
          sessionContent = await fs.readFile(sessionPath, 'utf8');
        } catch {}
      }

      const sessionsDir = getSessionsDir(target);
      let sessions = [];
      try {
        const entries = await fs.readdir(sessionsDir);
        sessions = entries
          .filter((f) => f.endsWith('.md'))
          .sort()
          .reverse()
          .slice(0, 20);
      } catch {}

      res.json({
        index: indexContent,
        activeSession,
        sessionContent,
        recentSessions: sessions,
      });
    }),
  );

  app.post(
    '/api/v1/trail/start',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { target, task, agent } = req.body;
      const sessionsDir = getSessionsDir(target);
      await fs.mkdir(sessionsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const agentId = agent || 'unknown';
      const slug = task
        ? task
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 40)
        : 'task';
      const filename = `${timestamp}-${agentId}-${slug}.md`;
      const filepath = path.join(sessionsDir, filename);

      const SESSION_TEMPLATE = `# Trail Session: ${task || 'Untitled'}

## Objective

${task || ''}

## Current Phase

Orient

## Scope And Constraints

- In scope:
- Out of scope:
- Constraints:

## Loaded Context Packs

- core.agent-operating-system
- core.trail-discipline
- token.context-budget

## Evidence Read

- None yet.

## Commands Run And Outcomes

- None yet.

## Decisions Made

- None yet.

## What Worked

- None yet.

## What Failed

- None yet.

## Risks And Blockers

- None yet.

## Validation Status

Not run.

## Next Action

Start orientation.

## Handoff Summary

Not ready for handoff.
`;

      await fs.writeFile(filepath, SESSION_TEMPLATE, 'utf8');

      const indexPath = getIndexPath(target);
      let existingSessions = '';
      try {
        const existing = await fs.readFile(indexPath, 'utf8');
        const lines = existing.split('\n');
        const recent = lines.filter((l) => l.trim().startsWith('- `') && !l.includes(filename));
        existingSessions = recent.slice(0, 9).join('\n');
        if (existingSessions) existingSessions += '\n';
      } catch {
        /* no existing index */
      }
      const indexContent = `# Trail Index\n\nActive session: \`.ai/trail/sessions/${filename}\`\n\n## Recent Sessions\n\n- \`${filename}\`: ${task || 'Untitled'}\n${existingSessions}`;
      await fs.writeFile(indexPath, indexContent, 'utf8');

      res.json({ success: true, sessionFile: `.ai/trail/sessions/${filename}`, path: filepath });
    }),
  );

  app.put(
    '/api/v1/trail/update',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { target, sessionFile, content } = req.body;
      if (!sessionFile || !content) throw new AppError('sessionFile and content are required', 400);

      const filepath = path.resolve(getTrailDir(target), sessionFile.replace('.ai/trail/', ''));
      if (!filepath.startsWith(getTrailDir(target))) {
        throw new AppError('Invalid session file path', 403);
      }

      await fs.writeFile(filepath, content, 'utf8');
      res.json({ success: true });
    }),
  );

  app.get(
    '/api/v1/trail/sessions',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { target, limit = 20 } = req.query;
      const sessionsDir = getSessionsDir(target);
      let sessions = [];
      try {
        const entries = await fs.readdir(sessionsDir);
        const details = await Promise.all(
          entries
            .filter((f) => f.endsWith('.md'))
            .sort()
            .reverse()
            .slice(0, parseInt(limit, 10) || 20)
            .map(async (f) => {
              const fp = path.join(sessionsDir, f);
              try {
                const stat = await fs.stat(fp);
                const content = await fs.readFile(fp, 'utf8');
                const titleMatch = content.match(/^# Trail Session:\s*(.+)/m);
                const phaseMatch = content.match(/^## Current Phase\s*\n\s*(.+)/m);
                const tokensMatch = content.match(/tokens/i);
                return {
                  id: f,
                  title: titleMatch?.[1]?.trim() || f,
                  phase: phaseMatch?.[1]?.trim() || 'unknown',
                  hasTokens: Boolean(tokensMatch),
                  modified: stat.mtime.toISOString(),
                  size: stat.size,
                };
              } catch {
                return null;
              }
            }),
        );
        sessions = details.filter(Boolean);
      } catch {}
      res.json({ sessions });
    }),
  );

  app.get(
    '/api/v1/trail/session/:sessionId',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { target } = req.query;
      const { sessionId } = req.params;
      const safePath = path.resolve(getSessionsDir(target), path.basename(sessionId));
      if (!safePath.startsWith(getSessionsDir(target))) {
        throw new AppError('Invalid session path', 403);
      }
      try {
        const content = await fs.readFile(safePath, 'utf8');
        res.json({ session: { id: sessionId, content } });
      } catch {
        throw new AppError('Session not found', 404);
      }
    }),
  );

  app.post(
    '/api/v1/trail/resume',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { target, sessionId } = req.body;
      if (!sessionId) throw new AppError('sessionId is required', 400);

      const safePath = path.resolve(getSessionsDir(target), path.basename(sessionId));
      if (!safePath.startsWith(getSessionsDir(target))) {
        throw new AppError('Invalid session path', 403);
      }

      try {
        const content = await fs.readFile(safePath, 'utf8');
        const indexPath = getIndexPath(target);
        const indexContent = `# Trail Index\n\nActive session: \`.ai/trail/sessions/${path.basename(sessionId)}\`\n\n## Resumed Session\n\n- ${path.basename(sessionId)}\n`;
        await fs.writeFile(indexPath, indexContent, 'utf8');

        const objMatch = content.match(/^## Objective\s*\n\s*(.+)/m);
        const phaseMatch = content.match(/^## Current Phase\s*\n\s*(.+)/m);
        const nextMatch = content.match(/^## Next Action\s*\n\s*(.+)/m);
        const handoffMatch = content.match(/^## Handoff Summary\s*\n\s*([\s\S]+?)(?=\n##|\Z)/m);

        res.json({
          success: true,
          sessionFile: `.ai/trail/sessions/${path.basename(sessionId)}`,
          objective: objMatch?.[1]?.trim() || '',
          phase: phaseMatch?.[1]?.trim() || 'Orient',
          nextAction: nextMatch?.[1]?.trim() || '',
          handoffSummary: handoffMatch?.[1]?.trim() || '',
          content,
        });
      } catch {
        throw new AppError('Session not found', 404);
      }
    }),
  );
}
