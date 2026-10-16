// Test-only identities and adapters. No fixture is imported by application code.
export const testConfig = {
  environment: 'local',
  mode: 'local',
  local: true,
  secureCookies: false,
  port: 3000,
  publicUrl: 'http://localhost:3000',
  secret: 'a-test-session-key-with-more-than-thirty-two-characters',
  secretId: 'access-harbor/test',
  admins: ['approver@example.test'],
  oidcIssuer: 'http://localhost:4566/test-pool',
  oidcClientId: 'test-client',
  oidcClientSecret: 'test-only-secret',
  awsOptions: {
    region: 'us-east-1',
    endpoint: 'http://localhost:4566',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  },
  mailTransport: 'ses',
  mailFrom: 'access@example.test',
  smtp: {},
  resources: [
    {
      id: 'github-platform',
      provider: 'github',
      name: 'Fixture repository',
      repository: 'test-org/platform',
      installation_id: 1,
      permissions: { pull: 'Read', push: 'Write' },
    },
    {
      id: 'github-web',
      provider: 'github',
      name: 'Second fixture repository',
      repository: 'test-org/web',
      installation_id: 1,
      permissions: { pull: 'Read', push: 'Write' },
    },
  ],
  identities: {
    alex: { email: 'requester@example.test', name: 'Test Requester', github_username: 'requester' },
    morgan: { email: 'approver@example.test', name: 'Test Approver', github_username: 'approver' },
  },
};
export const providerStub = () => ({
  preflight: async () => {},
  step: async () => ({ done: true, operation: null }),
});
export const mailStub = { sendMail: async () => {}, close: () => {} };
