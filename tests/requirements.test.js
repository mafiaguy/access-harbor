import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrationRequirements } from '../src/requirements.js';
import { testConfig } from './fixtures.js';

test('requirements reference Secrets Manager for GitHub keys and OIDC secrets', () => {
  const groups = integrationRequirements(testConfig);
  const github = groups.find((g) => g.name === 'GitHub');
  assert.ok(github.fields.some((f) => f.location.includes('Secrets Manager')));
  assert.ok(groups.find((g) => g.name === 'Application secrets'));
});
test('requirements expose no credential values and only enabled integrations', () => {
  const groups = integrationRequirements({
    ...testConfig,
    resources: [],
    githubPrivateKey: 'never-expose-a-private-key',
    oidcClientSecret: 'never-expose-an-oidc-secret',
  });
  const output = JSON.stringify(groups);
  assert.ok(!output.includes('never-expose'));
  assert.ok(!groups.some((g) => g.name === 'GitHub'));
});
