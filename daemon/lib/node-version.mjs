// Fail fast with an actionable message when the runtime is too old to load
// `node:sqlite` (DatabaseSync), which Nokta's DB layer depends on. This must
// run before any module that imports `node:sqlite` is loaded.
const MIN_MAJOR = 22;
const MIN_MINOR = 5;
const MIN_PATCH = 0;

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version || '');
  if (!match) return null;
  return { major: +match[1], minor: +match[2], patch: +match[3] };
}

const current = parseVersion(process.version);
const ok =
  current !== null &&
  (current.major > MIN_MAJOR ||
    (current.major === MIN_MAJOR && current.minor > MIN_MINOR) ||
    (current.major === MIN_MAJOR && current.minor === MIN_MINOR && current.patch >= MIN_PATCH));

if (!ok) {
  const message =
    'Nokta requires Node.js >= ' +
    MIN_MAJOR +
    '.' +
    MIN_MINOR +
    '.' +
    MIN_PATCH +
    ' (found ' +
    process.version +
    ').\n' +
    'The database layer uses node:sqlite (DatabaseSync), which is unavailable on older runtimes.\n' +
    'Install a newer Node.js (e.g. via nvm: "nvm install 22" or https://nodejs.org) and retry.';
  process.stderr.write(message + '\n');
  process.exit(1);
}

export const NODE_VERSION_OK = true;
