import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSecrets } from '../src/secrets.js';
import { awsRuntime } from '../src/aws-runtime.js';

test('Secrets Manager reads AWSCURRENT and whitelists in-memory application credentials', async () => {
  let command;
  const client = {
    send: async (input) => {
      command = input;
      return {
        SecretString: JSON.stringify({
          SESSION_SECRET: 's'.repeat(48),
          OIDC_CLIENT_SECRET: 'oidc-value',
          GITHUB_APP_PRIVATE_KEY: 'pem-value',
          UNRELATED: 'do-not-load',
        }),
      };
    },
  };
  const result = await readSecrets('app/bundle', {}, client);
  assert.equal(command.input.VersionStage, 'AWSCURRENT');
  assert.equal(command.input.SecretId, 'app/bundle');
  assert.equal(result.GITHUB_APP_PRIVATE_KEY, 'pem-value');
  assert.equal(result.UNRELATED, undefined);
});
test('missing, malformed or inaccessible secrets cannot fall back to plaintext', async () => {
  await assert.rejects(readSecrets('', {}, {}), /SECRETS_MANAGER_SECRET_ID/);
  await assert.rejects(
    readSecrets('app', {}, { send: async () => ({ SecretString: 'sensitive-invalid-content' }) }),
    (error) => !error.message.includes('sensitive-invalid-content'),
  );
  await assert.rejects(
    readSecrets(
      'app',
      {},
      {
        send: async () => {
          throw new Error('secret-error-content');
        },
      },
    ),
    (error) => !error.message.includes('secret-error-content'),
  );
  await assert.rejects(
    readSecrets('app', {}, { send: async () => ({ SecretString: '{}' }) }),
    /SESSION_SECRET/,
  );
  for (const key of [
    'SECRET_KEY',
    'OIDC_CLIENT_SECRET',
    'GITHUB_PRIVATE_KEY_PATH',
    'GITHUB_APP_PRIVATE_KEY',
    'SMTP_PASSWORD',
    'SMTP_USER',
  ])
    assert.throws(() => awsRuntime({ APP_ENV: 'local', [key]: 'plaintext' }), /Secrets Manager/);
});
test('local AWS clients target Floci with emulator-only credentials; production rejects overrides', () => {
  const local = awsRuntime({ APP_ENV: 'local', FLOCI_ENDPOINT: 'http://floci:4566' });
  assert.equal(local.awsOptions.endpoint, 'http://floci:4566');
  assert.equal(local.awsOptions.credentials.accessKeyId, 'test');
  const production = awsRuntime({ APP_ENV: 'production' });
  assert.equal(production.awsOptions.credentials, undefined);
  assert.equal(production.awsOptions.endpoint, undefined);
  for (const env of [
    { APP_ENV: 'production', FLOCI_ENDPOINT: 'http://floci:4566' },
    { APP_ENV: 'production', AWS_ACCESS_KEY_ID: 'static' },
    { APP_ENV: 'local', FLOCI_ENDPOINT: 'https://remote.example.com' },
    { APP_ENV: 'production', AWS_ENDPOINT_URL: 'http://floci:4566' },
  ])
    assert.throws(() => awsRuntime(env));
});
