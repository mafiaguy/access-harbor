import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { awsRuntime } from '../src/aws-runtime.js';
import { SecretsManagerClient, CreateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { provisionLocal } from './provision-local.js';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function envValue(value) {
  value = String(value);
  if (/[\r\n]/.test(value)) throw new Error('Configuration values must be on one line.');
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"') && !value.includes('\\')) return `"${value}"`;
  throw new Error(
    'This value needs both quote styles. Set it directly in the deployment environment instead.',
  );
}
export function writeSetup({ env, resources, identities }, directory = '.') {
  awsRuntime(env); // Reject plaintext secrets before any file is written.
  fs.mkdirSync(`${directory}/config`, { recursive: true });
  const files = [
    [
      `${directory}/.env`,
      Object.entries(env)
        .map(([key, value]) => `${key}=${envValue(value)}`)
        .join('\n') + '\n',
    ],
    [`${directory}/config/catalog.json`, JSON.stringify(resources, null, 2) + '\n'],
    [`${directory}/config/identities.json`, JSON.stringify(identities, null, 2) + '\n'],
  ];
  for (const [file, content] of files) {
    const mode = file.endsWith('/.env') ? 0o600 : 0o644;
    fs.writeFileSync(file + '.tmp', content, { mode });
    fs.chmodSync(file + '.tmp', mode);
    fs.renameSync(file + '.tmp', file);
  }
}
export async function ask(label, fallback = '', check = () => true) {
  for (;;) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const response = (await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim();
    rl.close();
    const value = response || fallback;
    const result = check(value);
    if (result === true) return value;
    console.log(typeof result === 'string' ? result : 'Please enter a valid value.');
  }
}
export async function secret(label) {
  if (!process.stdin.isTTY) return ask(label, '', (v) => !!v);
  process.stdout.write(`${label} (hidden): `);
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    function finish() {
      process.stdin.off('data', read);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stdout.write('\n');
    }
    function read(chunk) {
      for (const ch of chunk.toString()) {
        if (ch === '\u0003') {
          finish();
          return reject(new Error('Setup cancelled.'));
        }
        if (ch === '\r' || ch === '\n') {
          if (!value) continue;
          finish();
          return resolve(value);
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    }
    process.stdin.on('data', read);
  });
}
const required = (value) => !!value || 'This value is required.';
const email = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || 'Enter an email address.';
async function main() {
  console.log(
    '\nAccess Harbor setup\nSecrets are written directly to Secrets Manager. Local files contain only configuration and secret references.\n',
  );
  if (['.env', 'config/catalog.json', 'config/identities.json'].some((file) => fs.existsSync(file)))
    throw new Error(
      'Configuration already exists. Keep it and update its secret bundle/configuration deliberately; setup will not replace it.',
    );
  const environment = await ask('Environment: local (Floci) or production', 'local', (v) =>
    ['local', 'production'].includes(v),
  );
  const env = {
    APP_ENV: environment,
    AWS_REGION: await ask('AWS region', 'us-east-1'),
    SECRETS_MANAGER_SECRET_ID: await ask(
      'Application secret bundle name',
      `access-harbor/${environment}`,
    ),
    PORT: '3000',
    DATABASE_PATH: `data/${environment}.sqlite`,
    CATALOG_PATH: 'config/catalog.json',
    IDENTITIES_PATH: 'config/identities.json',
  };
  if (environment === 'local') {
    env.FLOCI_ENDPOINT = await ask(
      'Floci endpoint',
      process.env.FLOCI_ENDPOINT || 'http://localhost:4566',
    );
    env.FLOCI_PUBLIC_URL = 'http://localhost:4566';
    env.PUBLIC_URL = 'http://localhost:3000';
    awsRuntime(env);
    console.log(
      '\nCreate your own local accounts. These authenticate through Floci Cognito; there is no application sign-in bypass.',
    );
    const people = [];
    for (const role of ['Administrator', 'Requester'])
      people.push({
        email: await ask(`${role} email`, '', email),
        name: await ask(`${role} name`, '', required),
        password: await secret(`${role} password (12+ characters)`),
      });
    if (people[0].email.toLowerCase() === people[1].email.toLowerCase())
      throw new Error('Use two different people so requests can be independently approved.');
    if (people.some((p) => p.password.length < 12))
      throw new Error('Use passwords of at least 12 characters.');
    const result = await provisionLocal(env, people);
    writeSetup(result);
    console.log(
      '\nLocal environment configured.\nRun npm start and npm run worker in separate terminals.\nSign in at http://localhost:3000 with the accounts you just created.\nEmails are captured by Floci SES. GitHub can be added with a real App afterward.',
    );
    return;
  }
  const https = (value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  };
  env.PUBLIC_URL = await ask('Application HTTPS origin', '', https);
  env.ACCESS_DOMAIN = new URL(env.PUBLIC_URL).hostname;
  env.OIDC_ISSUER_URL = await ask('OIDC issuer URL', '', https);
  env.OIDC_CLIENT_ID = await ask('OIDC client ID', '', required);
  const bundle = {
    SESSION_SECRET: randomBytes(48).toString('base64url'),
    OIDC_CLIENT_SECRET: await secret('OIDC client secret'),
  };
  env.ADMIN_EMAILS = await ask('First administrator verified email', '', email);
  const sub = await ask('Administrator immutable OIDC subject', '', required);
  const identities = {
    [sub]: { email: env.ADMIN_EMAILS, name: await ask('Administrator name', '', required) },
  };
  const tools = await ask('Connect github, aws, or both', 'both', (v) =>
    ['github', 'aws', 'both'].includes(v),
  );
  const resources = [];
  if (tools !== 'aws') {
    env.GITHUB_APP_ID = await ask('GitHub App ID', '', (v) => /^\d+$/.test(v));
    const keyPath = await ask(
      'Existing GitHub App private key file to import into Secrets Manager',
      '',
      required,
    );
    bundle.GITHUB_APP_PRIVATE_KEY = fs.readFileSync(keyPath, 'utf8');
    const repository = await ask('Repository (owner/name)', '', (v) =>
      /^[\w.-]+\/[\w.-]+$/.test(v),
    );
    const installation_id = await ask('GitHub App installation ID', '', (v) => /^\d+$/.test(v));
    resources.push({
      id: 'github-main',
      provider: 'github',
      name: repository,
      repository,
      installation_id,
      permissions: { pull: 'Read', push: 'Write' },
    });
    identities[sub].github_username = await ask('Administrator GitHub username', '', required);
  }
  if (tools !== 'github') {
    env.AWS_SSO_INSTANCE_ARN = await ask('IAM Identity Center instance ARN', '', required);
    env.AWS_PORTAL_URL = await ask('AWS access portal URL', '', https);
    const account_id = await ask('AWS account ID', '', (v) => /^\d{12}$/.test(v));
    const arn = await ask('Permission-set ARN', '', required);
    resources.push({
      id: 'aws-main',
      provider: 'aws',
      name: await ask('Account name', '', required),
      account_id,
      permissions: { access: 'Approved access' },
      permission_sets: { access: arn },
    });
    identities[sub].aws_user_id = await ask('Administrator Identity Center user ID', '', required);
  }
  env.MAIL_TRANSPORT = await ask('Email service: ses or smtp', 'ses', (v) =>
    ['ses', 'smtp'].includes(v),
  );
  env.MAIL_FROM = await ask('Verified sender email', '', email);
  if (env.MAIL_TRANSPORT === 'smtp') {
    env.SMTP_HOST = await ask('SMTP host', '', required);
    env.SMTP_PORT = await ask('SMTP port', '587');
    bundle.SMTP_USER = await ask('SMTP username (blank for relay)');
    if (bundle.SMTP_USER) bundle.SMTP_PASSWORD = await secret('SMTP password');
  }
  if ((await ask('Add a requester? yes/no', 'yes', (v) => ['yes', 'no'].includes(v))) === 'yes') {
    const requester = await ask('Requester OIDC subject', '', (v) => !!v && v !== sub);
    identities[requester] = {
      email: await ask('Requester verified email', '', email),
      name: await ask('Requester name', '', required),
    };
    if (tools !== 'aws')
      identities[requester].github_username = await ask('Requester GitHub username', '', required);
    if (tools !== 'github')
      identities[requester].aws_user_id = await ask(
        'Requester Identity Center user ID',
        '',
        required,
      );
  }
  const manager = new SecretsManagerClient(awsRuntime(env).awsOptions);
  try {
    await manager.send(
      new CreateSecretCommand({
        Name: env.SECRETS_MANAGER_SECRET_ID,
        SecretString: JSON.stringify(bundle),
      }),
      { abortSignal: AbortSignal.timeout(20000) },
    );
  } finally {
    manager.destroy();
  }
  writeSetup({ env, resources, identities });
  console.log(
    '\nSecret bundle created. Local configuration contains no credentials.\nRun npm run doctor -- --online, then deploy web and worker with their AWS workload role.',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    const safeNames = [
      'ResourceExistsException',
      'ResourceNotFoundException',
      'CredentialsProviderError',
      'AccessDeniedException',
    ];
    console.error(
      safeNames.includes(error.name)
        ? `Setup failed: ${error.name}. Check workload identity, permissions and existing resources.`
        : error.constructor === Error
          ? error.message
          : 'Setup could not complete. Check Floci/AWS connectivity and configuration.',
    );
    process.exitCode = 1;
  });
