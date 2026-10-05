// Variables the child worker IS allowed to inherit. Everything else — provider
// keys, tokens, secrets, machine-specific config — is dropped deliberately.
// The previous version had this inverted: it only copied keys matching
// BLOCKED_PREFIXES, so children received NOKTA_*/AWS_*/GITHUB_* and lost PATH.
const BASE_ALLOW = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'SHELL',
  'USER',
  'LOGNAME',
  'TERM',
  'TMPDIR',
  'TMP',
  'TEMP',
  'NODE_ENV',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
];

export function createSafeEnv() {
  const safe = {};
  for (const key of BASE_ALLOW) {
    const value = process.env[key];
    if (typeof value === 'string') safe[key] = value;
  }
  // The worker needs its own identity to run; never inherit the parent's
  // NOKTA_* secrets — job-queue already re-adds the NOKTA_JOB_* it sets itself.
  return safe;
}
