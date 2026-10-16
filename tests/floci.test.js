import { test } from 'node:test';
import { checkContainers } from './container-check.js';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  CognitoIdentityProviderClient,
  DeleteUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { IdentitystoreClient, DeleteUserCommand } from '@aws-sdk/client-identitystore';
import {
  SSOAdminClient,
  ListInstancesCommand,
  DeletePermissionSetCommand,
} from '@aws-sdk/client-sso-admin';
import { SecretsManagerClient, DeleteSecretCommand } from '@aws-sdk/client-secrets-manager';
import { SESv2Client, DeleteEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { awsRuntime } from '../src/aws-runtime.js';
import { createServer } from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { provisionLocal } from '../scripts/provision-local.js';
import { writeSetup } from '../scripts/setup.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { requestAccess, reviewRequest, stopAccess } from '../src/access.js';
import { tick } from '../src/engine.js';
import { AWSProvider } from '../src/providers/aws.js';

const endpoint = process.env.FLOCI_TEST_ENDPOINT;
test(
  'Floci: Secrets Manager, real OIDC code flow, SES, and IAM Identity Center grant/removal',
  { skip: !endpoint, timeout: 90000 },
  async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-floci-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    let handler = (_req, res) => res.end('starting');
    const server = createServer((req, res) => handler(req, res)).listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const origin = `http://localhost:${server.address().port}`;
    const people = [
      {
        email: `approver-${randomBytes(4).toString('hex')}@example.test`,
        name: 'Integration Approver',
        password: 'A7!' + randomBytes(24).toString('base64url'),
      },
      {
        email: `requester-${randomBytes(4).toString('hex')}@example.test`,
        name: 'Integration Requester',
        password: 'A7!' + randomBytes(24).toString('base64url'),
      },
    ];
    const env = {
      APP_ENV: 'local',
      FLOCI_ENDPOINT: endpoint,
      FLOCI_PUBLIC_URL: endpoint,
      AWS_REGION: 'us-east-1',
      SECRETS_MANAGER_SECRET_ID: `access-harbor/integration-${randomBytes(6).toString('hex')}`,
      PUBLIC_URL: origin,
      MAIL_FROM: `integration-${randomBytes(4).toString('hex')}@localhost.test`,
    };
    const result = await provisionLocal(env, people);
    t.after(async () => {
      const options = awsRuntime(env).awsOptions;
      const sso = new SSOAdminClient(options),
        identity = new IdentitystoreClient(options),
        cognito = new CognitoIdentityProviderClient(options),
        manager = new SecretsManagerClient(options),
        ses = new SESv2Client(options);
      try {
        const instance = (await sso.send(new ListInstancesCommand({}))).Instances.find(
          (i) => i.InstanceArn === result.env.AWS_SSO_INSTANCE_ARN,
        );
        await Promise.all(
          Object.values(result.identities).map((u) =>
            identity.send(
              new DeleteUserCommand({
                IdentityStoreId: instance.IdentityStoreId,
                UserId: u.aws_user_id,
              }),
            ),
          ),
        );
        await sso.send(
          new DeletePermissionSetCommand({
            InstanceArn: instance.InstanceArn,
            PermissionSetArn: result.resources[0].permission_sets.readonly,
          }),
        );
        await cognito.send(
          new DeleteUserPoolCommand({ UserPoolId: result.env.OIDC_ISSUER_URL.split('/').at(-1) }),
        );
        await manager.send(
          new DeleteSecretCommand({
            SecretId: env.SECRETS_MANAGER_SECRET_ID,
            ForceDeleteWithoutRecovery: true,
          }),
        );
        await ses.send(new DeleteEmailIdentityCommand({ EmailIdentity: result.env.MAIL_FROM }));
      } finally {
        for (const client of [sso, identity, cognito, manager, ses]) client.destroy();
      }
    });
    writeSetup(result, directory);
    const config = await loadConfig({
      ...result.env,
      CATALOG_PATH: path.join(directory, 'config/catalog.json'),
      IDENTITIES_PATH: path.join(directory, 'config/identities.json'),
      DATABASE_PATH: path.join(directory, 'db.sqlite'),
    });
    assert.ok(config.secret.length >= 32);
    assert.equal(
      fs.readFileSync(path.join(directory, '.env'), 'utf8').includes(config.oidcClientSecret),
      false,
    );
    const db = openDatabase(config.databasePath, 'local');
    t.after(() => db.close());
    handler = createApp(config, db);
    await checkContainers(directory);
    // Exercise the normal OIDC route against Floci's managed login, including cookies and PKCE.
    const cookies = new Map();
    async function call(url, options = {}) {
      const parsed = new URL(url);
      assert.ok([origin, new URL(endpoint).origin].includes(parsed.origin));
      const jar = cookies.get(parsed.origin) || new Map();
      const response = await fetch(url, {
        redirect: 'manual',
        ...options,
        headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...options.headers },
      });
      for (const entry of response.headers.getSetCookie()) {
        const pair = entry.split(';')[0];
        const index = pair.indexOf('=');
        jar.set(pair.slice(0, index), pair.slice(index + 1));
      }
      cookies.set(parsed.origin, jar);
      return response;
    }
    async function follow(response) {
      for (let i = 0; response.status >= 300 && response.status < 400 && i < 10; i++)
        response = await call(new URL(response.headers.get('location'), response.url).href);
      return response;
    }
    let login = await follow(await call(origin + '/auth/login'));
    assert.equal(login.status, 200);
    const html = await login.text();
    const form = new URLSearchParams();
    const decode = (value) =>
      value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
    for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
      const name = input[0].match(/\bname=["']([^"']+)["']/i)?.[1],
        value = input[0].match(/\bvalue=["']([^"']*)["']/i)?.[1];
      if (name) form.set(decode(name), decode(value || ''));
    }
    form.set('username', people[1].email);
    form.set('password', people[1].password);
    const action = html.match(/<form\b[^>]*action=["']([^"']+)["']/i)?.[1] || login.url;
    login = await follow(
      await call(new URL(decode(action), login.url).href, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      }),
    );
    const home = await login.text();
    assert.equal(login.status, 200);
    assert.ok(home.includes('My access'));
    assert.ok(home.includes('Integration Requester'));
    const requesterEntry = Object.entries(result.identities).find(
        ([, u]) => u.email === people[1].email,
      ),
      adminEntry = Object.entries(result.identities).find(([, u]) => u.email === people[0].email);
    const requester = { sub: requesterEntry[0], ...requesterEntry[1] },
      admin = { sub: adminEntry[0], ...adminEntry[1] };
    const id = requestAccess(db, config, requester, {
      resource: 'aws-local',
      permission: 'readonly',
      days: '1',
      reason: 'Verify the local Floci access lifecycle',
    });
    reviewRequest(db, config, admin, id, 'approve');
    const row = () => db.prepare('SELECT * FROM requests WHERE id=?').get(id);
    for (let i = 0; i < 10 && row().status !== 'active'; i++) {
      await tick(db, config);
      if (row().status !== 'active') await new Promise((r) => setTimeout(r, 2100));
    }
    assert.equal(row().status, 'active');
    const provider = new AWSProvider(
      config,
      JSON.parse(row().resource_json),
      JSON.parse(row().identity_json),
    );
    t.after(() => provider.client.destroy());
    assert.equal(await provider.assigned(row()), true);
    stopAccess(db, config, requester, id);
    for (let i = 0; i < 10 && row().status !== 'revoked'; i++) {
      await tick(db, config);
      if (row().status !== 'revoked') await new Promise((r) => setTimeout(r, 2100));
    }
    assert.equal(row().status, 'revoked');
    assert.equal(await provider.assigned(row()), false);
    // Make a second real grant overdue to verify scheduled removal without waiting a day.
    const expiringId = requestAccess(db, config, requester, {
      resource: 'aws-local',
      permission: 'readonly',
      days: '1',
      reason: 'Verify scheduled expiry against Floci',
    });
    reviewRequest(db, config, admin, expiringId, 'approve');
    const expiring = () => db.prepare('SELECT * FROM requests WHERE id=?').get(expiringId);
    for (let i = 0; i < 10 && expiring().status !== 'active'; i++) {
      await tick(db, config);
      if (expiring().status !== 'active') await new Promise((r) => setTimeout(r, 2100));
    }
    assert.equal(expiring().status, 'active');
    db.prepare('UPDATE requests SET expires_at=? WHERE id=?').run(Date.now() - 1, expiringId);
    for (let i = 0; i < 10 && expiring().status !== 'expired'; i++) {
      await tick(db, config);
      if (expiring().status !== 'expired') await new Promise((r) => setTimeout(r, 2100));
    }
    assert.equal(expiring().status, 'expired');
    assert.equal(await provider.assigned(expiring()), false);
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM outbox WHERE sent_at IS NULL').get().count,
      0,
    );
  },
);
