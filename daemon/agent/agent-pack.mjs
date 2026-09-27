// Agent packs are 267 `.agent.json` files in /agents. The catalog route has
// always listed them, but nothing ever executed one: a run created a plan from
// a free-text goal and never learned which agent it was supposed to be. This
// module is the missing half — it turns a pack into a run.
//
// Deliberate design choice: a pack execution produces a *deliverable*, not a
// code change. An agent persona is asked to research and report, and its answer
// is persisted as run metadata. It gets no `edit` step, so it cannot write to
// the repository at all and the fail-open scope enforcer is never consulted.
// Changing code is a separate concern that needs an explicit, scoped request.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderProjectContext } from './project-context.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AGENTS_DIR = path.resolve(__dirname, '..', '..', 'agents');

const slug = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// The catalog is read on every /api/v1/agents call and packs change rarely, so
// cache them. `force` exists for tests and for picking up a rebuilt index.
let cache = null;

export async function loadAgentPacks({ force = false } = {}) {
  if (cache && !force) return cache;
  const files = await fs.readdir(AGENTS_DIR).catch(() => []);
  const packs = [];
  for (const file of files.filter((f) => f.endsWith('.agent.json'))) {
    const raw = await fs.readFile(path.join(AGENTS_DIR, file), 'utf8').catch(() => null);
    if (!raw) continue;
    try {
      const pack = JSON.parse(raw);
      pack.sourceFile = file;
      packs.push(pack);
    } catch {
      // A malformed pack should not take down the whole catalog.
    }
  }
  packs.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  cache = packs;
  return packs;
}

// Accepts the pack id (`agent.trailkeeper`), the filename stem
// (`trailkeeper.agent`), or a title slug, because all three appear in URLs and
// in the dashboard and it is not worth making callers normalize. The needle is
// slugged as well as the pack fields, so a value that arrived from a URL with a
// trailing separator ("SRE (Site Reliability Engineer)" -> "...engineer-") still
// matches.
export function resolveAgentPack(id, packs) {
  if (!id) return null;
  const raw = String(id).toLowerCase();
  const needle = slug(raw);
  const matchers = [
    (p) => String(p.id).toLowerCase() === raw,
    (p) => slug(p.id) === needle,
    (p) => slug(p.title) === needle,
    (p) => p.sourceFile && slug(p.sourceFile.replace(/\.agent\.json$/, '')) === needle,
  ];
  for (const matches of matchers) {
    const found = packs.find((p) => matches(p));
    if (found) return found;
  }
  return null;
}

// Prompt rules are a request, not a guarantee: a real deliverable still cited
// docs/LOOP-DESIGN.md and marked it "Status: Found" in a repo where it does not
// exist. So the claim is checked mechanically after the fact rather than trusted.
// Any path the deliverable names is resolved against the real project root, and
// the ones that do not exist are reported on the run.
const CITATION_RE =
  /`([^`\n]{1,200})`|\]\(([^)\s]{1,200})\)|(?<![\w`(/])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[A-Za-z0-9]{1,8})\b/g;
// URLs are removed before scanning. Matching path-ish text inside
// "https://example.com/thing.md" otherwise yields "com/thing.md", which reads as
// a missing project file and is pure noise.
const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

function looksLikeRepoPath(token) {
  if (!token || /\s/.test(token)) return false;
  if (/^(https?:|mailto:|#|\/)/i.test(token)) return false;
  if (/\.(md|mjs|cjs|js|json|ts|tsx|jsx|sh|yml|yaml|toml|html|css|txt|sql|py|rb|go|rs)$/i.test(token)) {
    return true;
  }
  return false;
}

export async function auditCitations(text, projectRoot) {
  const haystack = String(text || '').replace(URL_RE, ' ');
  const candidates = new Set();
  for (const match of haystack.matchAll(CITATION_RE)) {
    const raw = (match[1] || match[2] || match[3] || '').trim().replace(/:[\d,-]+$/, '');
    if (looksLikeRepoPath(raw)) candidates.add(raw);
  }
  const missing = [];
  for (const candidate of candidates) {
    const resolved = path.resolve(projectRoot, candidate);
    // Stay inside the project; a citation like ../../etc/passwd is not a file
    // claim worth resolving and must not be probed.
    if (!resolved.startsWith(path.resolve(projectRoot))) continue;
    const exists = await fs
      .stat(resolved)
      .then((s) => s.isFile())
      .catch(() => false);
    if (!exists) missing.push(candidate);
  }
  return { checked: candidates.size, missing: missing.sort() };
}

const list = (items) => (Array.isArray(items) && items.length ? items.map((i) => `- ${i}`).join('\n') : null);

// The persona is the pack's own words. It is the system prompt for every step,
// which is what makes a run "this agent" rather than "a model asked a question".
export function buildAgentPersona(pack) {
  const sections = [
    `You are ${pack.title}.`,
    pack.role ? `\n${pack.role}` : null,
    list(pack.scope) ? `\nYour scope:\n${list(pack.scope)}` : null,
    list(pack.outputs) ? `\nWhat you produce:\n${list(pack.outputs)}` : null,
    list(pack.cannotDo) ? `\nYou must not:\n${list(pack.cannotDo)}` : null,
    list(pack.handoff) ? `\nWhat you hand off:\n${list(pack.handoff)}` : null,
  ].filter(Boolean);
  sections.push(
    '\nStay inside your scope. If the request is outside it, say so plainly and name who should handle it instead of guessing. Report what you actually found; if evidence is missing, say it is missing rather than inventing detail.',
  );
  return sections.join('\n');
}

// Skill bodies are truncated hard: four skills at 6KB is already 24KB of prompt,
// and the pack persona is the part that must not get crowded out.
export function renderSkillDigests(skills = []) {
  if (!skills.length) return 'No skills from the index matched this task.';
  return skills
    .map((s) => `### ${s.name}\n${(s.description || '').slice(0, 300)}\n\n${String(s.content || '').slice(0, 4000)}`)
    .join('\n\n');
}

// The evidence contract. A pack run is a `prompt` step: the model is given text
// and returns text. It has no tools, so it cannot open a file, run a command or
// diff anything. Without this clause it reliably invents file paths and claims
// to have run tests — a real deliverable came back citing src/loop.ts and
// "docs/loop-state.md" in a plain-JavaScript repo where neither exists, and
// asserting "no discrepancies were found".
const EVIDENCE_RULES = `Evidence rules, which are not optional:
- You have no tools. You cannot open files, search the repository, run commands, or run tests yourself. The evidence above was gathered for you; rely on it.
- The file listing is authoritative: if a path is in it, the file exists; if it is not, assume it does not, and say so rather than guessing a near-miss name.
- Do not write "found", "read", "confirmed" or similar about a file. You did not locate anything; you were handed a listing.
- The skills below are generic guidance from other projects. Any file paths they mention are examples, NOT evidence that those files exist here.
- Never claim to have executed, run, built, tested, or verified anything. You have not.
- Distinguish clearly between what the provided context shows and what you are inferring. Mark inferences as inference.
- If the context is not enough to answer, say exactly what is missing. An honest gap is the correct answer; a confident invention is a failure.`;

const CONTEXT_HEADER = 'Repository context (the only files you can refer to; it is ground truth):';

// A prompt step has no tools, so an agent asked to describe this codebase could
// only answer from generic skill text — real deliverables described an "RFC
// decomposition pipeline" and never once mentioned a file in the repo, while
// inventing another that did not exist. This step gives the run a real, bounded
// view: the tracked file list, what recently changed, and the contents of the
// files that describe the project. All are git or read-only commands, so they are
// accurate by construction, and the agent can no longer claim a file is absent
// when git lists it.
//
// This is a fixed evidence bundle, not a comprehension pass: a prompt step cannot
// read the whole repository. It sees names, recent history, and the manifest.
// Anything deeper has to come from a tool-calling run, which does not exist yet.
const EVIDENCE_COMMANDS = [
  'git ls-files | head -400',
  'git log --oneline -20 --name-only | head -120',
  'cat package.json | head -60',
  'cat README.md | head -80',
];

// Two prompt steps after the evidence step. A pack is a known quantity with a
// known job; letting the planner invent steps for it reintroduced the exact
// failure this feature exists to remove (a run rewriting the daemon). The
// deliverable step inherits the earlier steps' output via synthesizeUserTurn, and
// also gets the context and skills itself — relying on the research step to
// forward them is what let the final answer cite files that do not exist.
export function buildPackSteps({ pack, goal, skills = [], projectContext = null }) {
  const persona = buildAgentPersona(pack);
  const evidence = [
    projectContext ? `\n\n${CONTEXT_HEADER}\n${renderProjectContext(projectContext)}` : null,
    `\n\nSkills available to you:\n${renderSkillDigests(skills)}`,
  ].join('');

  return [
    {
      type: 'inspect',
      name: `Gather evidence: ${pack.title}`,
      commands: [...EVIDENCE_COMMANDS],
    },
    {
      type: 'prompt',
      name: `Research: ${pack.title}`,
      systemPrompt: `${persona}\n\n${EVIDENCE_RULES}`,
      messages: [
        {
          role: 'user',
          content: `Task: ${goal}

Work out what is needed to answer this. The evidence above is a real listing taken from this repository; treat it as authoritative about which files exist. Do not write any files. Report the concrete findings your deliverable must be built on: which listed files are relevant, what the recent changes suggest, and what is missing or wrong. If the evidence does not settle the question, say so.${evidence}`,
        },
      ],
    },
    {
      type: 'prompt',
      name: `Deliverable: ${pack.title}`,
      systemPrompt: `${persona}

You are now writing the final deliverable, building on your own research above. Produce Markdown. Lead with the answer, then the evidence behind it. Cite the files you actually used from the listing. State open questions and risks explicitly. If your research was insufficient, say what is still unknown instead of smoothing over it.

${EVIDENCE_RULES}`,
      messages: [
        {
          role: 'user',
          content: `Task: ${goal}

Write the deliverable now. It must stand on its own for someone who did not see your research.${evidence}`,
        },
      ],
    },
  ];
}
