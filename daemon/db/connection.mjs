import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';

let _db = null;
let _dbPath = null;

export function getDbPath() {
  if (_dbPath) return _dbPath;
  const dataDir = process.env.NOKTA_DATA_DIR || path.join(process.cwd(), '.nokta');
  fs.mkdirSync(dataDir, { recursive: true });
  _dbPath = path.join(dataDir, 'nokta.db');
  return _dbPath;
}

export function getDb() {
  if (_db) return _db;
  _db = new DatabaseSync(getDbPath());
  _db.exec('PRAGMA journal_mode=WAL');
  _db.exec('PRAGMA foreign_keys=ON');
  _db.exec('PRAGMA busy_timeout=5000');
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function exec(sql, params = []) {
  return getDb().exec(sql, params);
}

export function prepare(sql) {
  return getDb().prepare(sql);
}

export function transaction(fn) {
  const db = getDb();
  const tx = db.transaction(fn);
  return tx;
}
