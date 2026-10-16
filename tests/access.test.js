import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, validateCatalog } from '../src/config.js';
import { testConfig, providerStub, mailStub } from './fixtures.js';
import { openDatabase } from '../src/database.js';
import { requestAccess, reviewRequest, stopAccess } from '../src/access.js';
import { processRequest, tick as runTick, deliverMail } from '../src/engine.js';
import { AccessConflict } from '../src/providers/errors.js';
import { writeSetup, envValue } from '../scripts/setup.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tick = (db, config, options = {}) =>
  runTick(db, config, { makeProvider: providerStub, transport: mailStub, ...options });
const config = testConfig,
  alex = { sub: 'alex', ...config.identities.alex },
  morgan = { sub: 'morgan', ...config.identities.morgan };
const input = {
  resource: 'github-platform',
  permission: 'push',
  days: '1',
  reason: 'Investigate deployment incident ENG-204',
};
const now = () => 100000000;
function database(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  return db;
}
function row(db, id) {
  return db.prepare('SELECT * FROM requests WHERE id=?').get(id);
}

test('a request durably records audit and email for every admin', (t) => {
  const db = database(t),
    c = { ...config, admins: [...config.admins, 'second@example.com'] };
  const id = requestAccess(db, c, alex, input, now());
  assert.equal(row(db, id).status, 'pending');
  assert.equal(db.prepare('SELECT count(*) AS n FROM outbox').get().n, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM audit').get().n, 1);
  assert.throws(() => requestAccess(db, c, alex, input), /already have/);
});
test('duration, permission, reason and identity are validated by the server', (t) => {
  const db = database(t);
  for (const days of ['0', '31', '1.5', 'abc', ''])
    assert.throws(() => requestAccess(db, config, alex, { ...input, days }));
  assert.throws(() => requestAccess(db, config, alex, { ...input, permission: 'owner' }));
  assert.throws(() => requestAccess(db, config, alex, { ...input, reason: 'short' }));
  assert.throws(
    () => requestAccess(db, config, { ...alex, sub: 'unknown' }, input),
    /not been enrolled/,
  );
  assert.equal(db.prepare('SELECT count(*) AS n FROM requests').get().n, 0);
});
test('only another admin can approve; a decision is atomic and cannot repeat', (t) => {
  const db = database(t),
    id = requestAccess(db, config, alex, input, now());
  assert.throws(() => reviewRequest(db, config, alex, id, 'approve'), /Only administrators/);
  reviewRequest(db, config, morgan, id, 'approve', 'Approved for investigation', now());
  assert.equal(row(db, id).status, 'provisioning');
  assert.throws(() => reviewRequest(db, config, morgan, id, 'deny'), /already been reviewed/);
  const own = requestAccess(db, config, morgan, { ...input, resource: 'github-web' }, now());
  assert.throws(() => reviewRequest(db, config, morgan, own, 'approve'), /Another administrator/);
});
test('denied and cancelled requests never grant access', async (t) => {
  const db = database(t),
    id = requestAccess(db, config, alex, input, now());
  reviewRequest(db, config, morgan, id, 'deny', 'No longer required', now());
  const second = requestAccess(db, config, alex, input, now());
  stopAccess(db, config, alex, second, now());
  await tick(db, config, { now });
  assert.equal(row(db, id).status, 'denied');
  assert.equal(row(db, second).status, 'cancelled');
});
test('grant, restart, expiry and revocation retain durable lifecycle state', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'test.sqlite');
  let db = openDatabase(file);
  const id = requestAccess(db, config, alex, input, now());
  reviewRequest(db, config, morgan, id, 'approve', '', now());
  await tick(db, config, { now });
  assert.equal(row(db, id).status, 'active');
  assert.equal(row(db, id).expires_at, now() + 86400000);
  db.close();
  db = openDatabase(file);
  await tick(db, config, { now: () => now() + 86400001 });
  assert.equal(row(db, id).status, 'expired');
  db.close();
});
test('an existing grant is not touched and the request stops safely', async (t) => {
  const db = database(t),
    id = requestAccess(db, config, alex, input, now());
  reviewRequest(db, config, morgan, id, 'approve', '', now());
  let calls = 0;
  const makeProvider = () => ({
    preflight: async () => {
      throw new AccessConflict('Existing grant');
    },
    step: async () => {
      calls++;
    },
  });
  await tick(db, config, { now, makeProvider });
  assert.equal(row(db, id).status, 'failed');
  assert.equal(row(db, id).owned, 0);
  assert.equal(calls, 0);
});
test('failed revocation remains visible and retries instead of reporting success', async (t) => {
  const db = database(t),
    id = requestAccess(db, config, alex, input, now());
  reviewRequest(db, config, morgan, id, 'approve', '', now());
  await tick(db, config, { now });
  const expired = () => now() + 86400001;
  await tick(db, config, {
    now: expired,
    makeProvider: () => ({
      step: async () => {
        throw new Error('Provider unavailable');
      },
    }),
  });
  assert.equal(row(db, id).status, 'revoking');
  assert.ok(row(db, id).error);
  assert.ok(row(db, id).retry_at > expired());
  await tick(db, config, { now: () => expired() + 6000 });
  assert.equal(row(db, id).status, 'expired');
});
test('async provider operation ID is persisted and resumed without another create', async (t) => {
  const db = database(t),
    id = requestAccess(db, config, alex, input, now());
  reviewRequest(db, config, morgan, id, 'approve', '', now());
  let checked = 0;
  const makeProvider = () => ({
    preflight: async () => {
      checked++;
    },
    step: async (_action, r) =>
      r.operation_json
        ? { done: true, operation: null }
        : { done: false, operation: { action: 'grant', id: 'aws-operation-1' } },
  });
  await tick(db, config, { now, makeProvider });
  assert.match(row(db, id).operation_json, /aws-operation-1/);
  await tick(db, config, { now: () => now() + 3000, makeProvider });
  assert.equal(row(db, id).status, 'active');
  assert.equal(checked, 1);
});
test('an in-flight grant at expiry completes observation then queues revocation', async (t) => {
  const db = database(t),
    id = requestAccess(db, config, alex, input, now());
  reviewRequest(db, config, morgan, id, 'approve', '', now());
  const makeProvider = () => ({
    preflight: async () => {},
    step: async (_action, r) =>
      r.operation_json
        ? { done: true, operation: null }
        : { done: false, operation: { action: 'grant', id: 'op' } },
  });
  await tick(db, config, { now, makeProvider });
  await tick(db, config, { now: () => now() + 86400001, makeProvider });
  assert.equal(row(db, id).status, 'revoking');
  assert.equal(row(db, id).operation_json, null);
  await tick(db, config, { now: () => now() + 86400002 });
  assert.equal(row(db, id).status, 'expired');
});
test('a job lease prevents overlapping workers from executing the same request', async (t) => {
  const db = database(t),
    id = requestAccess(db, config, alex, input, now());
  reviewRequest(db, config, morgan, id, 'approve', '', now());
  let release, started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let count = 0;
  const makeProvider = () => ({
    preflight: async () => {},
    step: async () => {
      count++;
      started();
      await gate;
      return { done: true, operation: null };
    },
  });
  const job = processRequest(db, config, row(db, id), { now, makeProvider });
  await entered;
  await processRequest(db, config, row(db, id), { now, makeProvider });
  release();
  await job;
  assert.equal(count, 1);
});
test('a failed email stays in the durable outbox for retry', async (t) => {
  const db = database(t);
  requestAccess(db, config, alex, input, now());
  await deliverMail(db, config, {
    now,
    transport: {
      sendMail: async () => {
        throw new Error('SMTP down');
      },
    },
  });
  const email = db.prepare('SELECT * FROM outbox').get();
  assert.equal(email.sent_at, null);
  assert.equal(email.attempts, 1);
  assert.ok(email.retry_at > now());
});
test('resource snapshots preserve revocation data after catalog changes', async (t) => {
  const db = database(t),
    id = requestAccess(db, config, alex, input, now());
  reviewRequest(db, config, morgan, id, 'approve', '', now());
  await tick(db, { ...config, resources: [], identities: {} }, { now });
  assert.equal(row(db, id).status, 'active');
  assert.equal(JSON.parse(row(db, id).resource_json).repository, 'test-org/platform');
});
test('early revocation and cancellation enforce ownership', async (t) => {
  const db = database(t),
    id = requestAccess(db, config, alex, input, now());
  assert.throws(
    () => stopAccess(db, config, { sub: 'stranger', email: 'stranger@example.com' }, id),
    /not found/,
  );
  reviewRequest(db, config, morgan, id, 'approve', '', now());
  await tick(db, config, { now });
  stopAccess(db, config, alex, id, now());
  await tick(db, config, { now });
  assert.equal(row(db, id).status, 'revoked');
});
test('configuration fails closed without Secrets Manager and rejects removed modes', async () => {
  await assert.rejects(
    loadConfig({ APP_ENV: 'production', PUBLIC_URL: 'https://access.example.test' }),
    /SECRETS_MANAGER_SECRET_ID/,
  );
  await assert.rejects(loadConfig({ ACCESS_MODE: 'demo' }), /no longer supported/);
  assert.throws(() =>
    validateCatalog([
      { id: 'invalid', provider: 'github', name: 'Bad', permissions: { owner: 'Owner' } },
    ]),
  );
});
test('setup writes non-secret metadata but rejects plaintext credentials', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-setup-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.throws(
    () =>
      writeSetup(
        {
          env: { APP_ENV: 'local', SECRET_KEY: 'must-never-be-written' },
          resources: [],
          identities: {},
        },
        directory,
      ),
    /Secrets Manager/,
  );
  assert.equal(fs.existsSync(path.join(directory, '.env')), false);
  writeSetup(
    {
      env: { APP_ENV: 'local', SECRETS_MANAGER_SECRET_ID: 'access-harbor/local' },
      resources: [],
      identities: {},
    },
    directory,
  );
  if (process.platform !== 'win32')
    assert.equal(fs.statSync(path.join(directory, '.env')).mode & 0o777, 0o600);
  assert.throws(() => envValue('a\nb'), /one line/);
});
test('a local database cannot move into production', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-mode-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'db.sqlite');
  const db = openDatabase(file, 'local');
  db.close();
  assert.throws(() => openDatabase(file, 'production'), /different environment mode/);
});
