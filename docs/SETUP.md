# Set up Access Harbor

There is one application. Local development uses AWS-compatible Floci services; production uses AWS. Neither environment includes a built-in login or an automatic-success access provider.

## Local: start Floci and create your own accounts

Install Node.js 24+ and Docker, then run from this project:

```sh
npm ci
docker compose -f compose.floci.yaml up -d
npm run setup
```

If Node.js is not installed on the host, use the built application image for the wizard:

```sh
docker build -t access-harbor:local .
docker run --rm -it --user "$(id -u):$(id -g)" \
  --network access-harbor_default -e FLOCI_ENDPOINT=http://floci:4566 \
  -v "$PWD:/work" -w /work access-harbor:local node /app/scripts/setup.js
```

This uses the default Compose project network created by the Floci command above. Use your chosen network name if you override the project name.

Choose **local** and supply your administrator and requester names, email addresses and passwords. Use two different identities; self approval is forbidden. Passwords must meet the local Cognito policy (12+ characters including uppercase, lowercase, number and symbol). Do not paste passwords into chat or issue reports.

The wizard makes real SDK calls to Floci to create:

- A Cognito user pool, confidential OIDC client and the accounts you entered.
- Identity Center users, a permission set and an AWS resource catalog.
- A Secrets Manager bundle containing the generated session secret and Cognito client secret.
- A verified local SES sender.

It creates no access requests or assignments. Passwords are sent to the identity provider for account creation; they are not written into application configuration. Runtime application credentials come from Secrets Manager.

Run the two processes:

```sh
npm start
# In another terminal:
npm run worker
```

Visit **http://localhost:3000**. Company sign-in takes you to Floci Cognito's managed login. Sign in as your requester, request 1–30 days, sign out, and use a separate administrator to approve. The worker applies the Identity Center assignment through Floci and later removes it. Local email is captured by SES; inspect it at `http://localhost:4566/_aws/ses`.

Floci data is durable in the `floci-data` Docker volume. Do not remove that volume or the application's SQLite database while you need its accounts, secrets or grant schedules.

### Run the local app in containers

After the wizard creates `.env` and the metadata files:

```sh
docker compose -f compose.yaml -f compose.local.yaml up --build -d
```

The web/worker connect to `http://floci:4566` inside Docker. Browsers continue using `http://localhost:4566` for sign-in; local OIDC server requests are routed to the internal service while issuer, signature, state and nonce validation remain enabled. Do not change the public issuer hostname to a container-only name.

Do not run native and container web processes on port 3000 simultaneously. The local Compose override is only for local use. Floci is loopback-bound, and no Docker socket is mounted.

### Optional Floci web console

The browser console needs Docker access to launch its sidecar. To enable it locally:

```sh
docker compose -f compose.yaml -f compose.local.yaml -f compose.console.yaml up -d floci
```

Open `http://localhost:4566/_floci/ui`. The hostname `floci` is for container-to-container requests; use `localhost` in your browser. The first console launch downloads a sidecar image. This optional override grants Floci control of the local Docker engine; do not use it in production. Include the same override in subsequent local Compose commands to keep the console enabled. Access Harbor's setup wizard and AWS SDK calls do not require the console.

### Add GitHub locally

Floci does not emulate GitHub. Create a real GitHub App with **repository Administration: read and write**, install it on a dedicated test repository, and record the App ID and installation ID.

1. Add `GITHUB_APP_ID` to `.env` (an identifier, not a secret).
2. Store the App's PEM text as `GITHUB_APP_PRIVATE_KEY` in the existing Secrets Manager JSON bundle, preserving its other fields.
3. Add the repository, installation ID and allowed permissions to `config/catalog.json`.
4. Add the actual `github_username` mapping for each requester in `config/identities.json`.
5. Restart web and worker. Run `npm run doctor -- --online`, then verify an actual GitHub grant and removal.

The worker reads the PEM from Secrets Manager into memory. Do not mount a private key into the app, put it in .env, or send it to users. Users keep using their own GitHub identity; CLI access still requires their own supported GitHub authentication.

## Production: prepare your organization integrations

Run `npm run setup` and choose **production** in a fresh deployment checkout. Existing configuration is not overwritten automatically.

Gather:

| Setting | Where it comes from |
| --- | --- |
| Public HTTPS origin | Your domain, e.g. `https://access.example.com` |
| OIDC issuer and client ID | Your identity provider's confidential web application |
| OIDC client secret | Written directly into Secrets Manager by setup |
| Admin and requester OIDC subjects | Exact `sub` values issued to this client |
| GitHub App ID, installation ID, repositories | GitHub App settings and installation |
| GitHub App private key | Imported into Secrets Manager during setup |
| AWS region, Identity Center instance ARN | IAM Identity Center home region/settings |
| AWS account and existing permission-set ARNs | IAM Identity Center account configuration |
| Identity Center user IDs | User directory; distinct from OIDC subjects |
| Email sender and delivery service | SES (default), or TLS SMTP |

Register `https://your-domain/auth/callback` as the exact OIDC redirect. Use authorization code flow with PKCE and scopes `openid email profile`. Require a signed ID token with `sub`, `email` and boolean `email_verified: true`. Enable MFA and workforce restrictions at the IdP. The issuer URL is not the discovery-document URL. Access Harbor enrolls exact subject/email pairs; a verified email alone does not enroll anyone.

AWS access uses existing permission sets and direct user assignments. GitHub access uses collaborator grants and may require accepting a repository invitation. Review your organization policies before rollout.

## Secret bundle and workload identity

`SECRETS_MANAGER_SECRET_ID` identifies one JSON secret. Its supported fields are:

```text
SESSION_SECRET         required; generated securely by setup, at least 32 characters
OIDC_CLIENT_SECRET     required
GITHUB_APP_PRIVATE_KEY required when GitHub is enabled; complete RSA PEM text
SMTP_USER              optional; only for authenticated SMTP
SMTP_PASSWORD          required with SMTP_USER
```

The application reads `AWSCURRENT` at startup. Rotation requires restarting both web and worker; changing the session secret invalidates existing sessions. Values are held in memory, never rendered, logged or copied into .env. There is no plaintext fallback. A missing manager or invalid bundle blocks requests rather than switching modes.

The AWS SDK needs a bootstrap identity to read Secrets Manager. In production provide a **workload role** (e.g. ECS task role, EC2 instance role, or a platform workload identity). Do not use static AWS access-key environment variables. Locally the SDK uses non-secret emulator signing values only when targeting the explicitly allowed Floci endpoint.

Runtime IAM permissions:

- `secretsmanager:GetSecretValue` on the application secret ARN; `kms:Decrypt` if its customer-managed key requires it.
- `sso:CreateAccountAssignment`, `sso:DeleteAccountAssignment`, `sso:ListAccountAssignments`, `sso:DescribeAccountAssignmentCreationStatus`, `sso:DescribeAccountAssignmentDeletionStatus` for AWS-managed grants.
- `ses:SendEmail` for SES delivery; no SMTP secret is required when using SES and workload identity.

The **setup operator** additionally needs permission to create the secret bundle. Production setup does not create your IdP, GitHub App, AWS accounts, users, policies or permission sets. Scope policies to your resources following AWS service authorization documentation; test actual mutations before rollout.

## What is stored locally?

| File | Contents |
| --- | --- |
| `.env` | Non-secret settings and secret ID; owner-only permissions |
| `config/catalog.json` | Allowed resource and permission metadata |
| `config/identities.json` | Subject/email/provider identity mappings; no passwords |
| `data/local.sqlite` or `data/production.sqlite` | Requests, audits, outbox and server-side sessions |

The metadata JSON files are container-readable (0644) and gitignored. Restrict the host checkout directory if identity metadata is private on a shared host. The application is run as container UID 1000 with a writable data volume and read-only configuration mount.

## Deploy and verify

```sh
npm run doctor
npm run doctor -- --online
docker compose up --build -d
```

Put a trusted HTTPS reverse proxy before port 3000. The web service trusts one proxy hop; the proxy must set `X-Forwarded-Proto: https`. The included optional Caddy edge can provide TLS:

```sh
# Set ACCESS_DOMAIN and PUBLIC_URL, and point DNS at this host first.
docker compose -f compose.yaml -f compose.https.yaml up --build -d
```

A generic Docker host does not automatically supply an AWS role. Deploy the workload identity appropriate to your host/platform. Supported persistence is one host with a local SQLite volume, one web instance and one worker; multi-host HA/network filesystem SQLite is not supported.

Before inviting users:

1. Sign in as a requester with no existing access to a dedicated resource.
2. Submit a request and confirm every administrator receives the email.
3. Approve as a different administrator; verify actual provider permissions.
4. Remove access early and confirm the grant/invitation disappears at the provider.
5. Test denial and unmapped-user rejection.
6. Keep a 1-day test request to verify scheduled expiry in your environment.
7. Restart the worker during an operation and confirm it resumes.

Monitor `/health/ready`, the admin Setup page, worker logs and email backlog. `/health/live` only checks web liveness. Back up the SQLite volume with an online SQLite backup or stop both processes before copying; never discard it while grants are outstanding.

Removal is best-effort during outages and throttling. AWS assignment deletion does not instantly invalidate existing sessions. Configure short sessions and provider-specific revocation if strict cutoffs are required. See SECURITY.md.
