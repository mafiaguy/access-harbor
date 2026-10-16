import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import session from 'express-session';

export function openDatabase(filename, mode = 'production') {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS requests(
      id INTEGER PRIMARY KEY, subject TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL,
      resource_id TEXT NOT NULL, resource_json TEXT NOT NULL, identity_json TEXT NOT NULL,
      permission TEXT NOT NULL, reason TEXT NOT NULL, days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 30),
      status TEXT NOT NULL CHECK(status IN ('pending','provisioning','active','revoking','expired','revoked','denied','cancelled','failed')),
      created_at INTEGER NOT NULL, approved_at INTEGER, expires_at INTEGER, reviewer TEXT, decision_note TEXT,
      owned INTEGER NOT NULL DEFAULT 0, operation_json TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
      retry_at INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_request ON requests(subject,resource_id)
      WHERE status IN ('pending','provisioning','active','revoking');
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id), actor TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
      sent_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, error TEXT);
    CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS heartbeats(name TEXT PRIMARY KEY, at INTEGER NOT NULL);
    INSERT OR IGNORE INTO schema_versions VALUES(1, unixepoch()*1000);`);
  const recordedMode = db.prepare("SELECT value FROM metadata WHERE key='mode'").get();
  if (recordedMode && recordedMode.value !== mode) {
    db.close();
    throw new Error(
      'This database belongs to a different environment mode. Use separate databases for local and production environments.',
    );
  }
  db.prepare("INSERT OR IGNORE INTO metadata VALUES('mode',?)").run(mode);
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function audit(db, id, actor, event, now = Date.now()) {
  db.prepare('INSERT INTO audit(request_id,actor,event,created_at) VALUES(?,?,?,?)').run(
    id,
    actor,
    event,
    now,
  );
}
export function mail(db, recipient, subject, body) {
  db.prepare('INSERT INTO outbox(recipient,subject,body) VALUES(?,?,?)').run(
    recipient,
    subject,
    body,
  );
}
export class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }
  get(sid, done) {
    try {
      const row = this.db.prepare('SELECT * FROM sessions WHERE sid=?').get(sid);
      if (!row || row.expires_at <= Date.now()) {
        this.destroy(sid, () => {});
        return done(null, null);
      }
      done(null, JSON.parse(row.data));
    } catch (e) {
      done(e);
    }
  }
  set(sid, value, done) {
    try {
      this.db
        .prepare('INSERT OR REPLACE INTO sessions VALUES(?,?,?)')
        .run(
          sid,
          JSON.stringify(value),
          new Date(value.cookie.expires || Date.now() + 8 * 3600e3).getTime(),
        );
      done?.();
    } catch (e) {
      done?.(e);
    }
  }
  destroy(sid, done) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid=?').run(sid);
      done?.();
    } catch (e) {
      done?.(e);
    }
  }
}
