// Return labels and presence flags only. Never send credential values to a template.
export function integrationRequirements(config) {
  const field = (name, location, help, present) => ({
    name,
    location,
    help,
    configured: Boolean(present),
  });
  const groups = [
    {
      name: 'Company sign-in',
      fields: [
        field(
          'OIDC issuer URL',
          'OIDC_ISSUER_URL',
          'From your identity provider’s application settings.',
          config.oidcIssuer,
        ),
        field(
          'Client ID and client secret',
          'OIDC_CLIENT_ID / Secrets Manager: OIDC_CLIENT_SECRET',
          'Create a confidential OIDC web application. Keep its secret on the server.',
          config.oidcClientId && config.oidcClientSecret,
        ),
        field(
          'Enrolled users and administrators',
          'config/identities.json / ADMIN_EMAILS',
          'Map each immutable OIDC subject to a verified email. At least one different person must approve your requests.',
          Object.keys(config.identities).length && config.admins.length,
        ),
      ],
    },
  ];
  const github = config.resources.filter((r) => r.provider === 'github');
  if (github.length)
    groups.push({
      name: 'GitHub',
      fields: [
        field(
          'GitHub App ID',
          'GITHUB_APP_ID',
          'Create a GitHub App in your organization’s developer settings.',
          config.githubAppId,
        ),
        field(
          'GitHub App private key (.pem)',
          'Secrets Manager: GITHUB_APP_PRIVATE_KEY',
          'Generate the App’s private key and store it in Secrets Manager. This is not a personal access token or an SSH key.',
          config.githubPrivateKey,
        ),
        field(
          'Installation ID and repository',
          'config/catalog.json',
          'Install the App on the repositories you want to manage. Record the numeric installation ID and owner/repository.',
          github.every((r) => r.installation_id && r.repository),
        ),
        field(
          'Repository Administration: read and write',
          'GitHub App settings',
          'Required to add and remove collaborators. Confirm this in GitHub, then run a test grant and removal.',
          false,
        ),
        field(
          'Users’ GitHub usernames',
          'config/identities.json',
          'Map each requester to their existing GitHub account. Users receive no tokens or keys.',
          Object.values(config.identities).every((u) => u.github_username),
        ),
      ],
    });
  const aws = config.resources.filter((r) => r.provider === 'aws');
  if (aws.length)
    groups.push({
      name: 'AWS IAM Identity Center',
      fields: [
        field(
          'Home region and instance ARN',
          'AWS_REGION / AWS_SSO_INSTANCE_ARN',
          'Find these in IAM Identity Center, not the application’s OIDC login settings.',
          config.awsRegion && config.awsInstanceArn,
        ),
        field(
          'Account IDs and permission-set ARNs',
          'config/catalog.json',
          'Use existing permission sets and the 12-digit accounts where they should be assigned.',
          aws.every(
            (r) => r.account_id && Object.keys(r.permissions).every((p) => r.permission_sets?.[p]),
          ),
        ),
        field(
          'Workload IAM role',
          'Container hosting platform',
          'Attach a role that can list, create, delete and inspect account assignments. No static AWS keys are requested. Verify using online doctor and a smoke test.',
          false,
        ),
        field(
          'Users’ Identity Center IDs',
          'config/identities.json',
          'These are AWS user IDs, distinct from OIDC subjects and email addresses.',
          Object.values(config.identities).every((u) => u.aws_user_id),
        ),
      ],
    });
  groups.push({
    name: 'Application secrets',
    fields: [
      field(
        'Secret bundle',
        'SECRETS_MANAGER_SECRET_ID',
        'Session signing secret, OIDC client secret, GitHub App private key and SMTP credentials are read from Secrets Manager. No plaintext environment fallback.',
        config.secretId,
      ),
    ],
  });
  groups.push({
    name: 'Approval email',
    fields: [
      field(
        'Sender and delivery service',
        'MAIL_FROM / MAIL_TRANSPORT',
        'SES delivers emails through the AWS SDK; local AWS calls use Floci. SMTP credentials, if used in production, come from Secrets Manager.',
        config.mailFrom && config.mailTransport,
      ),
    ],
  });
  return groups.map((group) => ({
    ...group,
    fields: group.fields.map((item) => ({
      ...item,
      status: item.configured
        ? 'Configured'
        : ['Repository Administration: read and write', 'Workload IAM role'].includes(item.name)
          ? 'Verify in provider'
          : 'Missing or unmapped',
    })),
  }));
}
