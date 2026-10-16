import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export async function readSecrets(secretId, awsOptions, client) {
  if (!secretId) throw new Error('Set SECRETS_MANAGER_SECRET_ID to the application secret bundle.');
  const manager = client || new SecretsManagerClient(awsOptions);
  let result;
  try {
    result = await manager.send(
      new GetSecretValueCommand({ SecretId: secretId, VersionStage: 'AWSCURRENT' }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
  } catch {
    // SDK/server errors can contain request details. Never log a secret response or SDK error body.
    throw new Error(
      'Cannot read the application secret bundle. Check Secrets Manager availability and workload permissions.',
    );
  } finally {
    if (!client) manager.destroy();
  }
  let data;
  try {
    const value =
      result.SecretString ??
      (result.SecretBinary ? Buffer.from(result.SecretBinary).toString('utf8') : '');
    data = JSON.parse(value);
  } catch {
    throw new Error('The application secret bundle must be a JSON object.');
  }
  if (!data || Array.isArray(data) || typeof data !== 'object')
    throw new Error('The application secret bundle must be a JSON object.');
  for (const key of ['SESSION_SECRET', 'OIDC_CLIENT_SECRET'])
    if (typeof data[key] !== 'string' || !data[key])
      throw new Error(`Secret bundle is missing ${key}.`);
  if (data.SESSION_SECRET.length < 32)
    throw new Error('SESSION_SECRET in Secrets Manager must be at least 32 characters.');
  // Whitelist fields. Unrelated secrets are never copied into the application config.
  return Object.fromEntries(
    ['SESSION_SECRET', 'OIDC_CLIENT_SECRET', 'GITHUB_APP_PRIVATE_KEY', 'SMTP_USER', 'SMTP_PASSWORD']
      .filter((key) => typeof data[key] === 'string')
      .map((key) => [key, data[key]]),
  );
}
