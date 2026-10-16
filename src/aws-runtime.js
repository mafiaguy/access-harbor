// Workload identity in production; credentials below are only AWS emulator signing values.
export function awsRuntime(env = process.env) {
  const environment = env.APP_ENV || 'production';
  if (!['local', 'production'].includes(environment))
    throw new Error('APP_ENV must be local or production.');
  if (env.ACCESS_MODE)
    throw new Error('ACCESS_MODE is no longer supported. Configure APP_ENV and Secrets Manager.');
  for (const name of [
    'SECRET_KEY',
    'OIDC_CLIENT_SECRET',
    'GITHUB_PRIVATE_KEY_PATH',
    'GITHUB_APP_PRIVATE_KEY',
    'SMTP_PASSWORD',
    'SMTP_USER',
  ]) {
    if (env[name])
      throw new Error(`${name} must be stored in Secrets Manager, not environment variables.`);
  }
  if (Object.keys(env).some((key) => key.startsWith('AWS_ENDPOINT_URL') && env[key]))
    throw new Error(
      'Use FLOCI_ENDPOINT for local AWS services. AWS endpoint overrides are not accepted.',
    );
  const region = env.AWS_REGION || 'us-east-1';
  if (environment === 'production') {
    if (
      env.FLOCI_ENDPOINT ||
      env.AWS_ACCESS_KEY_ID ||
      env.AWS_SECRET_ACCESS_KEY ||
      env.AWS_SESSION_TOKEN
    )
      throw new Error(
        'Production uses AWS workload identity; Floci endpoints and static AWS credentials are not accepted.',
      );
    return { environment, local: false, awsOptions: { region, maxAttempts: 2 } };
  }
  const endpoint = new URL(env.FLOCI_ENDPOINT || 'http://localhost:4566');
  if (
    !['localhost', '127.0.0.1', '[::1]', 'floci', 'localhost.floci.io'].includes(
      endpoint.hostname,
    ) ||
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/'
  )
    throw new Error('FLOCI_ENDPOINT must point to the local Floci service.');
  return {
    environment,
    local: true,
    awsOptions: {
      region,
      maxAttempts: 2,
      endpoint: endpoint.origin,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    },
  };
}
