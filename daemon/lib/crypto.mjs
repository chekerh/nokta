import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let _masterKey = null;

function getMasterKey() {
  if (_masterKey) return _masterKey;

  const envKey = process.env.NOKTA_ENCRYPTION_KEY;
  if (envKey) {
    _masterKey = crypto.scryptSync(envKey, 'nokta-salt', KEY_LENGTH);
    return _masterKey;
  }

  const dataDir = process.env.NOKTA_DATA_DIR || path.join(process.cwd(), '.nokta');
  const keyPath = process.env.NOKTA_KEY_FILE || path.join(dataDir, '.encryption-key');

  try {
    const raw = fs.readFileSync(keyPath);
    _masterKey = raw;
    return _masterKey;
  } catch {
    const key = crypto.randomBytes(KEY_LENGTH);
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    console.error(`[nokta] Generated encryption key at ${keyPath}`);
    _masterKey = key;
    return _masterKey;
  }
}

export function encrypt(plaintext) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted,
    nonce: iv,
    tag,
  };
}

export function decrypt(encrypted, nonce, tag) {
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function encryptToString(plaintext) {
  const { encrypted, nonce, tag } = encrypt(plaintext);
  const combined = Buffer.concat([nonce, tag, encrypted]);
  return combined.toString('base64');
}

export function decryptFromString(encoded) {
  const combined = Buffer.from(encoded, 'base64');
  const nonce = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
  return decrypt(encrypted, nonce, tag);
}
