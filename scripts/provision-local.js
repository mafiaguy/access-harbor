import { randomBytes } from 'node:crypto';
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { IdentitystoreClient, CreateUserCommand } from '@aws-sdk/client-identitystore';
import {
  SSOAdminClient,
  ListInstancesCommand,
  CreateInstanceCommand,
  CreatePermissionSetCommand,
  AttachManagedPolicyToPermissionSetCommand,
} from '@aws-sdk/client-sso-admin';
import {
  SecretsManagerClient,
  CreateSecretCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { SESv2Client, CreateEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { awsRuntime } from '../src/aws-runtime.js';

export async function provisionLocal(env, people, clients) {
  const runtime = awsRuntime(env);
  if (!runtime.local) throw new Error('Local provisioning can only target Floci.');
  if (
    people.length !== 2 ||
    new Set(people.map((p) => p.email.toLowerCase())).size !== 2 ||
    people.some((p) => p.password.length < 12)
  )
    throw new Error(
      'Supply two distinct local identities with passwords of at least 12 characters.',
    );
  const owned = !clients;
  clients ||= {
    cognito: new CognitoIdentityProviderClient(runtime.awsOptions),
    identity: new IdentitystoreClient(runtime.awsOptions),
    sso: new SSOAdminClient(runtime.awsOptions),
    secrets: new SecretsManagerClient(runtime.awsOptions),
    ses: new SESv2Client(runtime.awsOptions),
  };
  const send = (client, command) =>
    client.send(command, { abortSignal: AbortSignal.timeout(20000) });
  try {
    try {
      await send(
        clients.secrets,
        new DescribeSecretCommand({ SecretId: env.SECRETS_MANAGER_SECRET_ID }),
      );
      throw new Error(
        'Secret bundle already exists. Reuse its configuration rather than recreating accounts.',
      );
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') throw error;
    }
    const pool = await send(
      clients.cognito,
      new CreateUserPoolCommand({
        PoolName: 'access-harbor',
        UsernameAttributes: ['email'],
        Policies: {
          PasswordPolicy: {
            MinimumLength: 12,
            RequireUppercase: true,
            RequireLowercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
          },
        },
      }),
    );
    const poolId = pool.UserPool?.Id;
    if (!poolId) throw new Error('Floci did not return a Cognito user pool.');
    const client = await send(
      clients.cognito,
      new CreateUserPoolClientCommand({
        UserPoolId: poolId,
        ClientName: 'access-harbor',
        GenerateSecret: true,
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthFlows: ['code'],
        AllowedOAuthScopes: ['openid', 'email', 'profile'],
        SupportedIdentityProviders: ['COGNITO'],
        CallbackURLs: [`${env.PUBLIC_URL}/auth/callback`],
        LogoutURLs: [`${env.PUBLIC_URL}/login`],
      }),
    );
    if (!client.UserPoolClient?.ClientSecret)
      throw new Error('Floci did not return the OIDC client secret.');
    let instance = (await send(clients.sso, new ListInstancesCommand({}))).Instances?.[0];
    if (!instance) {
      const created = await send(clients.sso, new CreateInstanceCommand({ Name: 'access-harbor' }));
      instance = (await send(clients.sso, new ListInstancesCommand({}))).Instances?.find(
        (i) => i.InstanceArn === created.InstanceArn,
      );
    }
    if (!instance?.InstanceArn || !instance.IdentityStoreId)
      throw new Error('Floci Identity Center instance is unavailable.');
    const permission = await send(
      clients.sso,
      new CreatePermissionSetCommand({
        InstanceArn: instance.InstanceArn,
        Name: 'AccessHarbor-' + randomBytes(4).toString('hex'),
        SessionDuration: 'PT1H',
      }),
    );
    const permissionArn = permission.PermissionSet?.PermissionSetArn;
    if (!permissionArn) throw new Error('Floci did not return a permission set.');
    await send(
      clients.sso,
      new AttachManagedPolicyToPermissionSetCommand({
        InstanceArn: instance.InstanceArn,
        PermissionSetArn: permissionArn,
        ManagedPolicyArn: 'arn:aws:iam::aws:policy/ReadOnlyAccess',
      }),
    );
    const identities = {};
    for (const person of people) {
      await send(
        clients.cognito,
        new AdminCreateUserCommand({
          UserPoolId: poolId,
          Username: person.email,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: person.email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: person.name },
          ],
        }),
      );
      await send(
        clients.cognito,
        new AdminSetUserPasswordCommand({
          UserPoolId: poolId,
          Username: person.email,
          Password: person.password,
          Permanent: true,
        }),
      );
      const cognitoUser = await send(
        clients.cognito,
        new AdminGetUserCommand({ UserPoolId: poolId, Username: person.email }),
      );
      const sub = cognitoUser.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
      if (!sub) throw new Error('Floci did not return an OIDC subject.');
      const user = await send(
        clients.identity,
        new CreateUserCommand({
          IdentityStoreId: instance.IdentityStoreId,
          UserName: person.email,
          DisplayName: person.name,
          Name: {
            GivenName: person.name.split(' ')[0],
            FamilyName: person.name.split(' ').slice(1).join(' ') || person.name,
          },
          Emails: [{ Value: person.email, Primary: true }],
        }),
      );
      if (!user.UserId) throw new Error('Floci did not return an Identity Center user ID.');
      identities[sub] = { email: person.email, name: person.name, aws_user_id: user.UserId };
    }
    const mailFrom = env.MAIL_FROM || 'access-harbor@localhost.test';
    try {
      await send(clients.ses, new CreateEmailIdentityCommand({ EmailIdentity: mailFrom }));
    } catch (error) {
      if (error.name !== 'AlreadyExistsException') throw error;
    }
    await send(
      clients.secrets,
      new CreateSecretCommand({
        Name: env.SECRETS_MANAGER_SECRET_ID,
        SecretString: JSON.stringify({
          SESSION_SECRET: randomBytes(48).toString('base64url'),
          OIDC_CLIENT_SECRET: client.UserPoolClient.ClientSecret,
        }),
      }),
    );
    return {
      env: {
        ...env,
        OIDC_ISSUER_URL: `${env.FLOCI_PUBLIC_URL}/${poolId}`,
        OIDC_CLIENT_ID: client.UserPoolClient.ClientId,
        ADMIN_EMAILS: people[0].email,
        AWS_SSO_INSTANCE_ARN: instance.InstanceArn,
        MAIL_TRANSPORT: 'ses',
        MAIL_FROM: mailFrom,
      },
      identities,
      resources: [
        {
          id: 'aws-local',
          provider: 'aws',
          name: 'Local AWS account',
          account_id: instance.OwnerAccountId || '000000000000',
          permissions: { readonly: 'Read only' },
          permission_sets: { readonly: permissionArn },
        },
      ],
    };
  } finally {
    if (owned) for (const client of Object.values(clients)) client.destroy();
  }
}
