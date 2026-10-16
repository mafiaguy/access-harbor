import fs from 'node:fs';
import path from 'node:path';
import { createPrivateKey } from 'node:crypto';
import { awsRuntime } from './aws-runtime.js';
import { readSecrets } from './secrets.js';

export function validateCatalog(resources) {
  if (!Array.isArray(resources) || !resources.length)
    throw new Error('Add at least one resource to config/catalog.json.');
  const ids = new Set();
  for (const r of resources) {
    if (!/^[a-z0-9-]{1,80}$/.test(r.id) || ids.has(r.id))
      throw new Error('Resource IDs must be unique lowercase names.');
    ids.add(r.id);
    if (!['github', 'aws'].includes(r.provider) || typeof r.name !== 'string' || !r.name.trim())
      throw new Error(`Invalid provider or name for ${r.id}.`);
    if (
      !r.permissions ||
      !Object.keys(r.permissions).length ||
      Object.values(r.permissions).some((v) => typeof v !== 'string')
    )
      throw new Error(`Add permissions to ${r.id}.`);
    if (
      r.provider === 'github' &&
      (!/^[\w.-]+\/[\w.-]+$/.test(r.repository) ||
        !/^\d+$/.test(String(r.installation_id)) ||
        Object.keys(r.permissions).some(
          (p) => !['pull', 'triage', 'push', 'maintain', 'admin'].includes(p),
        ))
    )
      throw new Error(`Check repository, installation_id, and GitHub permissions for ${r.id}.`);
    if (
      r.provider === 'aws' &&
      (!/^\d{12}$/.test(r.account_id) ||
        Object.keys(r.permissions).some(
          (p) =>
            !/^arn:aws(?:-us-gov|-cn)?:sso:::permissionSet\//.test(r.permission_sets?.[p] || ''),
        ))
    )
      throw new Error(`Check AWS account and permission-set ARNs for ${r.id}.`);
  }
  return resources;
}
export async function loadConfig(env = process.env, { secretsClient } = {}) {
  const runtime = awsRuntime(env);
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535.');
  const publicUrl = (env.PUBLIC_URL || (runtime.local ? `http://localhost:${port}` : '')).replace(
    /\/$/,
    '',
  );
  if (!publicUrl) throw new Error('Set PUBLIC_URL to your HTTPS application origin.');
  const origin = new URL(publicUrl);
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password)
    throw new Error('PUBLIC_URL must be an origin without a path, query or credentials.');
  if (!runtime.local && origin.protocol !== 'https:') throw new Error('Production requires HTTPS.');
  if (runtime.local && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
    throw new Error('Local application URL must use loopback.');
  const secrets = await readSecrets(
    env.SECRETS_MANAGER_SECRET_ID,
    runtime.awsOptions,
    secretsClient,
  );
  for (const key of ['ADMIN_EMAILS', 'OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'MAIL_FROM'])
    if (!env[key]) throw new Error(`Missing ${key}. Run npm run setup.`);
  const issuer = new URL(env.OIDC_ISSUER_URL);
  if (!runtime.local && issuer.protocol !== 'https:')
    throw new Error('Production OIDC requires HTTPS.');
  if (
    runtime.local &&
    issuer.origin !== new URL(env.FLOCI_PUBLIC_URL || 'http://localhost:4566').origin
  )
    throw new Error('Local OIDC must use the configured Floci public origin.');
  const resources = validateCatalog(
    JSON.parse(fs.readFileSync(env.CATALOG_PATH || 'config/catalog.json', 'utf8')),
  );
  const identities = JSON.parse(
    fs.readFileSync(env.IDENTITIES_PATH || 'config/identities.json', 'utf8'),
  );
  if (!identities || Array.isArray(identities) || typeof identities !== 'object')
    throw new Error('Identities must be keyed by OIDC subject.');
  for (const [sub, user] of Object.entries(identities))
    if (!sub || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email || ''))
      throw new Error('Every enrolled identity needs its verified email.');
  const admins = env.ADMIN_EMAILS.split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (
    !admins.length ||
    !admins.every((email) => Object.values(identities).some((u) => u.email.toLowerCase() === email))
  )
    throw new Error('Enroll every administrator in config/identities.json.');
  if (resources.some((r) => r.provider === 'github')) {
    if (!/^\d+$/.test(env.GITHUB_APP_ID || '') || !secrets.GITHUB_APP_PRIVATE_KEY)
      throw new Error(
        'Configure GITHUB_APP_ID and store GITHUB_APP_PRIVATE_KEY in Secrets Manager.',
      );
    try {
      if (createPrivateKey(secrets.GITHUB_APP_PRIVATE_KEY).asymmetricKeyType !== 'rsa')
        throw new Error();
    } catch {
      throw new Error('Secrets Manager must contain a valid RSA GitHub App private key.');
    }
  }
  if (resources.some((r) => r.provider === 'aws') && !env.AWS_SSO_INSTANCE_ARN)
    throw new Error('Set AWS_SSO_INSTANCE_ARN.');
  const mailTransport = env.MAIL_TRANSPORT || 'ses';
  if (!['ses', 'smtp'].includes(mailTransport))
    throw new Error('MAIL_TRANSPORT must be ses or smtp.');
  if (mailTransport === 'smtp' && (!env.SMTP_HOST || (secrets.SMTP_USER && !secrets.SMTP_PASSWORD)))
    throw new Error('Configure SMTP_HOST and store SMTP credentials together in Secrets Manager.');
  if (runtime.local && mailTransport !== 'ses') throw new Error('Local email uses Floci SES.');
  return {
    ...runtime,
    mode: runtime.environment,
    port,
    host: env.HOST || (runtime.local ? '127.0.0.1' : '0.0.0.0'),
    publicUrl,
    secureCookies: origin.protocol === 'https:',
    databasePath: path.resolve(env.DATABASE_PATH || `data/${runtime.environment}.sqlite`),
    secret: secrets.SESSION_SECRET,
    secretId: env.SECRETS_MANAGER_SECRET_ID,
    admins,
    resources,
    identities,
    oidcIssuer: env.OIDC_ISSUER_URL,
    oidcClientId: env.OIDC_CLIENT_ID,
    oidcClientSecret: secrets.OIDC_CLIENT_SECRET,
    githubAppId: env.GITHUB_APP_ID,
    githubPrivateKey: secrets.GITHUB_APP_PRIVATE_KEY,
    awsRegion: runtime.awsOptions.region,
    awsInstanceArn: env.AWS_SSO_INSTANCE_ARN,
    awsPortalUrl: env.AWS_PORTAL_URL,
    mailTransport,
    mailFrom: env.MAIL_FROM,
    smtp: {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_PORT === '465',
      requireTLS: true,
      ...(secrets.SMTP_USER
        ? { auth: { user: secrets.SMTP_USER, pass: secrets.SMTP_PASSWORD } }
        : {}),
    },
  };
}
