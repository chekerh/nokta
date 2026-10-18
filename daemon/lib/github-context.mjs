import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Pulls everything GitHub knows about one app: its repo metadata, open PRs,
// open issues, and recent commits. Auth is optional — public repos work
// unauthenticated (lower rate limit), private repos need GITHUB_TOKEN/GH_TOKEN.
// Every failure path returns a structured reason instead of throwing so the UI
// can render a useful "why is this empty" state.

const API = 'https://api.github.com';
const TIMEOUT_MS = 8000;

// origin URL forms: git@github.com:o/r.git, https://github.com/o/r.git, ssh://git@github.com/o/r
export function parseRemoteUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const ssh = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  const scpLike = ssh ? { host: ssh[1], path: ssh[2] } : null;
  let host;
  let pathname;
  if (scpLike) {
    host = scpLike.host;
    pathname = scpLike.path;
  } else {
    let parsed;
    try {
      parsed = new URL(url.trim());
    } catch {
      return null;
    }
    host = parsed.hostname;
    pathname = parsed.pathname;
  }
  const clean = pathname.replace(/^\/+/, '').replace(/\.git$/, '');
  const [owner, repo] = clean.split('/');
  if (!host || !owner || !repo) return null;
  return { host, owner, repo };
}

// A remote can embed credentials (https://<token>@github.com/owner/repo.git).
// Strip them at the source so no downstream caller can echo a secret into a
// response, a log, or a generated prompt.
export function stripCredentials(url) {
  return String(url || '').replace(/\/\/[^/@]*@/, '//');
}

// Read the origin remote of a local repo. Returns null when it is not a git
// repo or has no origin (a perfectly normal state for a brand-new app).
export async function resolveRepo(rootPath) {
  try {
    const { stdout } = await run('git', ['-C', rootPath, 'remote', 'get-url', 'origin'], { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 });
    const url = stripCredentials(stdout.trim());
    const parsed = parseRemoteUrl(url);
    if (!parsed) return { url, repo: null, reason: 'origin-unrecognized' };
    return { url, repo: parsed, reason: null };
  } catch (error) {
    // ENOENT is a missing git binary; git's exit 128 means "no origin configured".
    const reason = error.code === 'ENOENT' ? 'git-missing' : error.code === 128 || /not a git repository|No such remote/i.test(String(error.message)) ? 'no-origin' : 'git-failed';
    return { url: null, repo: null, reason };
  }
}

function headers(token) {
  const base = { Accept: 'application/vnd.github+json', 'User-Agent': 'nokta' };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

function summarizePulls(payload) {
  return (payload || []).slice(0, 5).map(pr => ({ number: pr.number, title: pr.title, author: pr.user?.login || 'unknown', url: pr.html_url }));
}

function summarizeIssues(payload) {
  return (payload || []).filter(issue => !issue.pull_request).slice(0, 5).map(issue => ({ number: issue.number, title: issue.title, author: issue.user?.login || 'unknown', url: issue.html_url }));
}

function summarizeCommits(payload) {
  return (payload || []).slice(0, 5).map(commit => ({ sha: (commit.sha || '').slice(0, 7), message: (commit.commit?.message || '').split('\n')[0], author: commit.commit?.author?.name || 'unknown', date: commit.commit?.author?.date || null }));
}

// Full context bundle for one repo. `repo` is the {host, owner, repo} shape
// returned by parseRemoteUrl/resolveRepo.
export async function fetchRepoContext(repo, { token, fetchImpl = fetch } = {}) {
  if (!repo) return { available: false, reason: 'no-repo' };
  const host = repo.host || 'github.com';
  const auth = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;

  if (host !== 'github.com') {
    return { available: false, reason: 'non-github-host', host, owner: repo.owner, name: repo.repo };
  }

  const call = async pathname => {
    try {
      const response = await fetchImpl(`${API}${pathname}`, { headers: headers(auth), signal: AbortSignal.timeout(TIMEOUT_MS) });
      return { ok: response.ok, status: response.status, body: response.ok ? await response.json() : null };
    } catch (error) {
      return { ok: false, status: 0, body: null, error: error.message };
    }
  };

  const base = `/repos/${repo.owner}/${repo.repo}`;
  // per_page=6 on issues because GitHub's issues endpoint also returns PRs;
  // summarizeIssues filters those out and keeps the first 5 real issues.
  const [meta, pulls, issues, commits] = await Promise.all([call(base), call(`${base}/pulls?state=open&per_page=5`), call(`${base}/issues?state=open&per_page=6`), call(`${base}/commits?per_page=5`)]);

  if (!meta.ok) {
    const reason = meta.status === 404 ? 'repo-not-found-or-private' : meta.status === 401 ? 'bad-credentials' : meta.status === 403 ? 'rate-limited' : 'unreachable';
    return { available: false, reason, status: meta.status, host, owner: repo.owner, name: repo.repo, authenticated: Boolean(auth) };
  }

  // A failed sub-request must not render as "no PRs/issues/commits" — the UI
  // needs to distinguish "none" from "could not find out".
  const partial = {};
  if (!pulls.ok) partial.pulls = pulls.status || pulls.error || 'unavailable';
  if (!issues.ok) partial.issues = issues.status || issues.error || 'unavailable';
  if (!commits.ok) partial.commits = commits.status || commits.error || 'unavailable';

  const data = meta.body || {};
  return {
    available: true,
    authenticated: Boolean(auth),
    host,
    owner: repo.owner,
    name: repo.repo,
    url: data.html_url || `https://github.com/${repo.owner}/${repo.repo}`,
    description: data.description || null,
    defaultBranch: data.default_branch || 'main',
    stars: data.stargazers_count ?? 0,
    openPulls: pulls.ok ? summarizePulls(pulls.body) : [],
    openIssues: issues.ok ? summarizeIssues(issues.body) : [],
    recentCommits: commits.ok ? summarizeCommits(commits.body) : [],
    partial: Object.keys(partial).length ? partial : null,
  };
}

// One call for the UI: resolve the local repo then fetch its context.
// The raw remote URL is intentionally not returned: remotes can embed
// credentials (https://<token>@github.com/...) and nothing consumes it.
export async function collectGitHubContext(rootPath, options = {}) {
  const resolved = await resolveRepo(rootPath);
  if (!resolved.repo) return { available: false, reason: resolved.reason || 'no-origin' };
  return fetchRepoContext(resolved.repo, options);
}
