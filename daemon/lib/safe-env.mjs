const BLOCKED_PREFIXES = [
  'NOKTA_',
  'NODE_',
  'HOME',
  'PATH',
  'LANG',
  'SHELL',
  'USER',
  'TERM',
  'TMPDIR',
  'XDG_',
  'SSH_',
  'GIT_',
  'HOMEBREW_',
  'DYLD_',
  'npm_',
  'nvm_',
  'AWS_',
  'GITHUB_',
];
const BLOCKED_KEYS = ['NOKTA_JWT_SECRET', 'NOKTA_ENCRYPTION_KEY'];

export function createSafeEnv() {
  const safe = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string') continue;
    if (BLOCKED_KEYS.includes(key)) continue;
    if (BLOCKED_PREFIXES.some((p) => key.startsWith(p))) {
      safe[key] = value;
    }
  }
  return safe;
}
