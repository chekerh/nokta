import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// JWT signing-key ring.
//
// Tokens carry a `kid` (a fingerprint of the secret that signed them) in their
// header, so a rotation can introduce a new signing key while keeping the
// previous one available to verify tokens that are still in flight — no user is
// logged out by a rotation.
//
// Durable rotation is a configuration change: point NOKTKA_JWT_SECRET at the new
// key and list the retired key(s) in NOKTKA_JWT_PREVIOUS_SECRETS, then restart.
// rotateKeys() performs the same move in-process (tests, programmatic rotation).

let currentKey = null; // { kid, secret }
let previousKeys = new Map(); // kid -> secret (verify only)

// A stable, non-secret identifier for a signing key. Derived from the secret so
// every process agrees on the kid without extra state, but it is only a hash,
// never the secret itself.
export function fingerprint(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex').slice(0, 16);
}

function loadPrimarySecret() {
  const secret = process.env.NOKTA_JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NOKTA_JWT_SECRET must be set explicitly in production');
  }
  const dataDir = process.env.NOKTA_DATA_DIR || path.join(process.cwd(), '.nokta');
  const secretPath = path.join(dataDir, '.jwt-secret');
  try {
    return fs.readFileSync(secretPath, 'utf8').trim();
  } catch {
    const key = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, key, { mode: 0o600 });
    return key;
  }
}

function loadPreviousSecrets() {
  return (process.env.NOKTA_JWT_PREVIOUS_SECRETS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function initKeys() {
  const secret = loadPrimarySecret();
  currentKey = { kid: fingerprint(secret), secret };
  previousKeys = new Map(loadPreviousSecrets().map((s) => [fingerprint(s), s]));
  return currentKey.kid;
}

function ensure() {
  if (!currentKey) initKeys();
}

export function getCurrentKey() {
  ensure();
  return currentKey;
}

// Resolve the secret named by a token's `kid`, or undefined when it is unknown.
export function getKey(kid) {
  ensure();
  if (kid === currentKey.kid) return currentKey.secret;
  return previousKeys.get(kid);
}

// Promote a new signing key at runtime. The outgoing key is retained for
// verification (unless it is the same key), so tokens already issued keep
// working until they expire. Returns the new kid.
export function rotateKeys(newSecret) {
  ensure();
  const secret = newSecret || crypto.randomBytes(32).toString('hex');
  const kid = fingerprint(secret);
  if (currentKey.kid !== kid) previousKeys.set(currentKey.kid, currentKey.secret);
  currentKey = { kid, secret };
  return kid;
}

// Clear in-memory state so the next call re-reads configuration. Test-only.
export function resetKeys() {
  currentKey = null;
  previousKeys = new Map();
}
