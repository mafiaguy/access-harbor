import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubProvider } from '../src/providers/github.js';
import { AWSProvider } from '../src/providers/aws.js';
import { AccessConflict } from '../src/providers/errors.js';

test('GitHub preflight rejects inherited or direct repository permissions', async () => {
  const provider = new GitHubProvider({}, { repository: 'org/repo' }, { github_username: 'alex' });
  provider.call = async () => ({ status: 200, body: { permission: 'read' } });
  await assert.rejects(provider.preflight(), AccessConflict);
});
test('GitHub removes invitations before collaborator access', async () => {
  const provider = new GitHubProvider({}, { repository: 'org/repo' }, { github_username: 'alex' }),
    calls = [];
  provider.invitations = async () => [{ id: 42 }];
  provider.call = async (...args) => {
    calls.push(args);
    return { status: 204 };
  };
  await provider.step('revoke', {});
  assert.deepEqual(calls, [
    ['DELETE', '/repos/org/repo/invitations/42'],
    ['DELETE', '/repos/org/repo/collaborators/alex'],
  ]);
});
test('AWS resumes a persisted asynchronous creation instead of sending another create', async () => {
  const calls = [];
  const client = {
    send: async (command) => {
      calls.push(command);
      return { AccountAssignmentCreationStatus: { Status: 'SUCCEEDED', RequestId: 'op' } };
    },
  };
  const provider = new AWSProvider(
    {},
    {
      instanceArn: 'instance',
      account_id: '123456789012',
      permission_sets: { dev: 'permission-set' },
    },
    { aws_user_id: 'user-id' },
    client,
  );
  const result = await provider.step('grant', {
    permission: 'dev',
    operation_json: JSON.stringify({ action: 'grant', id: 'op' }),
  });
  assert.equal(result.done, true);
  assert.equal(calls[0].constructor.name, 'DescribeAccountAssignmentCreationStatusCommand');
  assert.equal(calls[0].input.AccountAssignmentCreationRequestId, 'op');
});
test('AWS preflight paginates all assignments and preserves a preexisting grant', async () => {
  let count = 0;
  const client = {
    send: async () =>
      ++count === 1
        ? { AccountAssignments: [], NextToken: 'page-2' }
        : { AccountAssignments: [{ PrincipalType: 'USER', PrincipalId: 'user-id' }] },
  };
  const provider = new AWSProvider(
    {},
    {
      instanceArn: 'instance',
      account_id: '123456789012',
      permission_sets: { dev: 'permission-set' },
    },
    { aws_user_id: 'user-id' },
    client,
  );
  await assert.rejects(provider.preflight({ permission: 'dev' }), AccessConflict);
  assert.equal(count, 2);
});
