import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { testConfig } from './fixtures.js';
import { createHmac, randomBytes } from 'node:crypto';
import { openDatabase } from '../src/database.js';

async function browser(t) {
  const config = testConfig,
    db = openDatabase(':memory:');
  const server = createApp(config, db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function get(path, options = {}) {
    const response = await fetch(origin + path, {
      redirect: 'manual',
      ...options,
      headers: { cookie, ...options.headers },
    });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const html = await response.text();
    return { response, html };
  }
  async function login(role) {
    // Seed the server-side test session, never an authentication bypass HTTP route.
    const sid = randomBytes(24).toString('hex');
    const csrf = randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
      sid,
      JSON.stringify({
        user: { sub: role, ...config.identities[role] },
        csrf,
        cookie: {
          originalMaxAge: 28800000,
          expires: new Date(Date.now() + 28800000).toISOString(),
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
          secure: false,
        },
      }),
      Date.now() + 28800000,
    );
    const signature = createHmac('sha256', config.secret)
      .update(sid)
      .digest('base64')
      .replace(/=+$/, '');
    cookie = 'harbor.sid=' + encodeURIComponent(`s:${sid}.${signature}`);
    return csrf;
  }
  return { get, login, db, config };
}
test('web routes enforce login, admin role, and CSRF; pages render successfully', async (t) => {
  const { get, login } = await browser(t);
  assert.equal((await get('/')).response.status, 302);
  assert.equal((await get('/guide')).response.status, 200);
  const csrf = await login('alex');
  for (const path of ['/', '/request']) assert.equal((await get(path)).response.status, 200);
  assert.equal((await get('/setup')).response.status, 403);
  assert.equal((await get('/approvals')).response.status, 403);
  const invalid = await get('/requests', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: 'bad' }),
  });
  assert.equal(invalid.response.status, 403);
  const created = await get('/requests', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrf,
      resource: 'github-platform',
      permission: 'pull',
      days: '1',
      reason: 'Investigate deployment incident',
    }),
  });
  assert.equal(created.response.status, 302);
  assert.equal((await get(created.response.headers.get('location'))).response.status, 200);
  await login('morgan');
  assert.equal((await get('/approvals')).response.status, 200);
  assert.equal((await get('/setup')).response.status, 200);
  assert.equal((await get('/health/ready')).response.status, 503);
});
test('request history escapes untrusted reason text', async (t) => {
  const { get, login } = await browser(t);
  const csrf = await login('alex');
  const result = await get('/requests', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrf,
      resource: 'github-platform',
      permission: 'pull',
      days: '1',
      reason: '<script>alert("unsafe")</script>',
    }),
  });
  const { html } = await get(result.response.headers.get('location'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>alert'));
});
