import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseRemoteUrl, fetchRepoContext, stripCredentials, collectGitHubContext, resolveRepo } from '../daemon/lib/github-context.mjs';

// parseRemoteUrl must recognize the origin forms git actually produces, or the
// whole feature silently finds "no repo" for a perfectly normal clone.
test('parses https, ssh scp-like, and ssh URL forms', () => {
  for (const url of ['https://github.com/chekerh/nokta.git', 'git@github.com:chekerh/nokta.git', 'ssh://git@github.com/chekerh/nokta.git']) {
    const parsed = parseRemoteUrl(url);
    assert.equal(parsed.owner, 'chekerh', `owner wrong for ${url}`);
    assert.equal(parsed.repo, 'nokta', `repo wrong for ${url}`);
    assert.equal(parsed.host, 'github.com', `host wrong for ${url}`);
  }
});

test('rejects garbage and non-repo URLs', () => {
  assert.equal(parseRemoteUrl(''), null);
  assert.equal(parseRemoteUrl(null), null);
  assert.equal(parseRemoteUrl('not a url'), null);
  assert.equal(parseRemoteUrl('https://github.com/only-owner'), null);
});

function stubFetch(routes) {
  return async url => {
    const match = routes.find(route => url.includes(route.includes));
    if (!match) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: match.ok !== false, status: match.status || 200, json: async () => match.body };
  };
}

test('builds a full context bundle and separates issues from PRs', async () => {
  const fetchImpl = stubFetch([
    { includes: '/pulls?', body: [{ number: 7, title: 'Add feature', user: { login: 'dev' }, html_url: 'https://github.com/o/r/pull/7' }] },
    { includes: '/issues?', body: [{ number: 3, title: 'Bug', user: { login: 'qa' }, html_url: 'https://github.com/o/r/issues/3' }, { number: 9, title: 'PR-masquerading', pull_request: {}, user: { login: 'x' } }] },
    { includes: '/commits?', body: [{ sha: 'abcdef1234', commit: { message: 'Fix thing\n\ndetails', author: { name: 'Dev', date: '2026-01-01T00:00:00Z' } } }] },
    { includes: '/repos/o/r', body: { html_url: 'https://github.com/o/r', description: 'desc', default_branch: 'main', stargazers_count: 12 } },
  ]);
  const context = await fetchRepoContext({ host: 'github.com', owner: 'o', repo: 'r' }, { fetchImpl, token: 'tok' });
  assert.equal(context.available, true);
  assert.equal(context.defaultBranch, 'main');
  assert.equal(context.stars, 12);
  assert.equal(context.openPulls.length, 1);
  assert.equal(context.openIssues.length, 1, 'issues endpoint entries with a pull_request field are PRs and must be filtered out');
  assert.equal(context.recentCommits[0].sha, 'abcdef1', 'sha is shortened to 7 chars');
  assert.equal(context.recentCommits[0].message, 'Fix thing', 'only the first line of a commit message is used');
});

test('does not send a bearer token when none is configured', async () => {
  let seen;
  const fetchImpl = async (url, options = {}) => {
    seen = options.headers || {};
    return { ok: true, status: 200, json: async () => (url === 'https://api.github.com/repos/o/r' ? { html_url: 'u', default_branch: 'main', stargazers_count: 0 } : []) };
  };
  await fetchRepoContext({ host: 'github.com', owner: 'o', repo: 'r' }, { fetchImpl, token: null });
  assert.ok(!('Authorization' in seen), 'unauthenticated public read must not set an Authorization header');
});

test('reports a reason instead of throwing when the repo is missing or private', async () => {
  const fetchImpl = stubFetch([{ includes: '/repos/', ok: false, status: 404 }]);
  const context = await fetchRepoContext({ host: 'github.com', owner: 'o', repo: 'gone' }, { fetchImpl });
  assert.equal(context.available, false);
  assert.equal(context.reason, 'repo-not-found-or-private');
});

test('refuses non-GitHub hosts with an explicit reason', async () => {
  const context = await fetchRepoContext({ host: 'gitlab.com', owner: 'o', repo: 'r' }, { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  assert.equal(context.available, false);
  assert.equal(context.reason, 'non-github-host');
});

// Remote origins can embed credentials (https://<github-pat>@github.com/...).
// Stripping happens at the source, so nothing downstream can echo them.
test('strips embedded credentials from remote URLs', () => {
  assert.equal(stripCredentials('https://ghp_Zz9@github.com/o/r.git'), 'https://github.com/o/r.git');
  assert.equal(stripCredentials('https://user:pass@github.com/o/r.git'), 'https://github.com/o/r.git');
  assert.equal(stripCredentials('git@github.com:o/r.git'), 'git@github.com:o/r.git');
  assert.equal(parseRemoteUrl(stripCredentials('https://ghp_Zz9@github.com/o/r.git')).owner, 'o');
});

test('a credential-bearing origin never leaks into the collected context', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-origin-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  try {
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://ghp_Zz9@github.com/o/r.git']);
  } catch {
    t.skip('git unavailable');
    return;
  }
  const fetchImpl = async url => ({
    ok: true,
    status: 200,
    json: async () => (url === 'https://api.github.com/repos/o/r' ? { html_url: 'https://github.com/o/r', default_branch: 'main', stargazers_count: 0 } : []),
  });
  const context = await collectGitHubContext(dir, { fetchImpl });
  assert.equal(context.available, true, 'credential stripping must not break repo resolution');
  const serialized = JSON.stringify(context);
  assert.ok(!serialized.includes('ghp_Zz9'), 'the remote credential must never appear in a payload');
  assert.ok(!('remoteUrl' in context), 'the raw remote URL is intentionally not part of the payload');
});

// git's exit codes map to distinct reasons: 128 means "no origin / not a repo"
// (a normal state for a brand-new app), anything else is an unexpected failure.
test('resolveRepo reports no-origin for a directory that is not a git repo', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-nogit-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const resolved = await resolveRepo(dir);
  assert.equal(resolved.repo, null);
  assert.equal(resolved.reason, 'no-origin');
});

// A failed sub-request must read as "could not find out", not "there are none".
test('reports partial failures instead of rendering missing data as empty', async () => {
  const fetchImpl = stubFetch([
    { includes: '/pulls?', ok: false, status: 403 },
    { includes: '/issues?', body: [] },
    { includes: '/commits?', body: [] },
    { includes: '/repos/o/r', body: { html_url: 'u', default_branch: 'main', stargazers_count: 0 } },
  ]);
  const context = await fetchRepoContext({ host: 'github.com', owner: 'o', repo: 'r' }, { fetchImpl });
  assert.equal(context.available, true);
  assert.equal(context.partial.pulls, 403, 'the failing section keeps its status');
  assert.ok(!('issues' in context.partial), 'successful sections are not marked partial');
  assert.deepEqual(context.openPulls, []);
});
