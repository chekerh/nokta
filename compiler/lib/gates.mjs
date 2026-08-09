import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_TRAIL_HEADINGS = [
  'Objective',
  'Current Phase',
  'Scope And Constraints',
  'Loaded Context Packs',
  'Evidence Read',
  'Commands Run And Outcomes',
  'Decisions Made',
  'What Worked',
  'What Failed',
  'Risks And Blockers',
  'Validation Status',
  'Next Action',
  'Handoff Summary',
];

function extractActiveSession(indexContent) {
  const match = indexContent.match(/Active session:\s*`?([^`\n]+)`?/i);
  return match?.[1]?.trim() ?? null;
}

function normalizeHeading(heading) {
  return heading.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sectionContent(markdown, heading) {
  const wanted = normalizeHeading(heading);
  const lines = markdown.split(/\r?\n/);
  const captured = [];
  let active = false;
  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      if (active) break;
      active = normalizeHeading(match[1]) === wanted;
      continue;
    }
    if (active) captured.push(line);
  }
  return captured.join('\n').trim();
}

export function evaluateTrailGates(target) {
  const absoluteTarget = path.resolve(target);
  const indexPath = path.join(absoluteTarget, '.ai', 'trail', 'index.md');
  const results = [];

  if (!fs.existsSync(indexPath)) {
    return [
      {
        gate: 'trail.index',
        status: 'fail',
        message: 'Missing .ai/trail/index.md.',
        remediation: 'Create a trail index pointing to the active session file.',
      },
    ];
  }

  const indexContent = fs.readFileSync(indexPath, 'utf8');
  results.push({ gate: 'trail.index', status: 'pass', message: 'Trail index exists.' });

  const activeSession = extractActiveSession(indexContent);
  if (!activeSession) {
    results.push({
      gate: 'trail.active-session',
      status: 'fail',
      message: 'Trail index does not name an active session.',
      remediation: 'Add an Active session line with a .ai/trail/sessions/*.md path.',
    });
    return results;
  }

  const sessionPath = path.resolve(absoluteTarget, activeSession);
  if (!sessionPath.startsWith(absoluteTarget)) {
    results.push({
      gate: 'trail.active-session',
      status: 'fail',
      message: 'Active session points outside the target project.',
      remediation: 'Use a project-local .ai/trail/sessions/*.md file.',
    });
    return results;
  }

  if (!fs.existsSync(sessionPath)) {
    results.push({
      gate: 'trail.active-session',
      status: 'fail',
      message: `Active session does not exist: ${activeSession}`,
      remediation: 'Create the active session file or update the trail index.',
    });
    return results;
  }

  results.push({
    gate: 'trail.active-session',
    status: 'pass',
    message: `Active session exists: ${activeSession}`,
  });

  const sessionContent = fs.readFileSync(sessionPath, 'utf8');
  for (const heading of REQUIRED_TRAIL_HEADINGS) {
    const content = sectionContent(sessionContent, heading);
    results.push({
      gate: `trail.section.${heading.toLowerCase().replaceAll(' ', '-')}`,
      status: content ? 'pass' : 'fail',
      message: content ? `${heading} is present.` : `${heading} is missing or empty.`,
      remediation: content ? undefined : `Fill the ${heading} section in the active trail.`,
    });
  }

  const validation = sectionContent(sessionContent, 'Validation Status');
  if (/not run|not ready|pending/i.test(validation)) {
    results.push({
      gate: 'verification.status',
      status: 'fail',
      message: 'Validation status is not complete.',
      remediation: 'Run relevant checks or document exactly why verification cannot run.',
    });
  } else {
    results.push({
      gate: 'verification.status',
      status: 'pass',
      message: 'Validation status is complete enough for handoff.',
    });
  }

  const handoff = sectionContent(sessionContent, 'Handoff Summary');
  if (/not ready|in progress|todo/i.test(handoff)) {
    results.push({
      gate: 'handoff.summary',
      status: 'fail',
      message: 'Handoff summary is not complete.',
      remediation: 'Summarize final state, validation, residual risk, and next action.',
    });
  } else {
    results.push({
      gate: 'handoff.summary',
      status: 'pass',
      message: 'Handoff summary is complete enough for a new agent.',
    });
  }

  return results;
}

export function hasGateFailures(results) {
  return results.some((result) => result.status === 'fail');
}

export function formatGateResults(results) {
  return results
    .map((result) => {
      const prefix = result.status.toUpperCase();
      const remediation = result.remediation ? ` Remediation: ${result.remediation}` : '';
      return `[${prefix}] ${result.gate}: ${result.message}${remediation}`;
    })
    .join('\n');
}
