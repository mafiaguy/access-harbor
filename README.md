# Access Harbor

**Ask for access. Get approval. Let it expire.**

Open-source Node.js temporary-access management for GitHub and AWS IAM Identity Center. One application, with the same approval and provider code locally and in production. No built-in users, fake login, or automatic-success provider.

## Local development with Floci

Requires Node.js 24+ and Docker.

```sh
npm ci
docker compose -f compose.floci.yaml up -d
npm run setup
```

Choose **local**. Setup creates your own administrator and requester in Floci Cognito, maps them to local Identity Center users, configures a permission set and stores server secrets in Floci Secrets Manager. It does not populate requests or auto-approve access.

```sh
npm start
# Second terminal:
npm run worker
```

Open **http://localhost:3000**. Sign in using the accounts you created. Request 1–30 days of AWS access; a different administrator reviews it. Floci SES captures the notifications. GitHub requires a real GitHub App and is not emulated by Floci.

For containerized local application services, after setup:

```sh
docker compose -f compose.yaml -f compose.local.yaml up --build -d
```

## Secrets

All application credentials are read from **AWS Secrets Manager** at startup. Locally the SDK targets Floci’s Secrets Manager endpoint. Production uses a workload IAM role and the normal AWS endpoint.

The secret bundle contains `SESSION_SECRET`, `OIDC_CLIENT_SECRET`, optional `GITHUB_APP_PRIVATE_KEY`, and optional `SMTP_USER` / `SMTP_PASSWORD`. `.env` contains only secret IDs and non-secret metadata. Plaintext credential environment variables and mounted GitHub keys are rejected. The GitHub key stays in process memory.

Unavailable or invalid configuration blocks access. The web process shows a setup-required page; the worker refuses to start. There is no fallback login or provider.

## Production

Run `npm run setup` and choose **production**. Supply your actual OIDC configuration, enrolled identities, GitHub/AWS resource catalog and email service. Setup writes secrets directly to Secrets Manager. Give the runtime role `secretsmanager:GetSecretValue` on that bundle, optional `kms:Decrypt` for its customer-managed key, and the required Identity Center / SES permissions.

[Environment walkthrough](docs/SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)

## Tests and contributions

```sh
npm run check
npm run format:check
npm test
# Explicitly target the running local emulator for real SDK/OIDC integration tests:
FLOCI_TEST_ENDPOINT=http://localhost:4566 npm test
```

Unit tests use fixtures only inside `tests/`. The opt-in Floci test exercises Secrets Manager, signed OIDC sign-in with PKCE, real Identity Center assignment/removal API calls and SES delivery. It creates and cleans up isolated integration resources inside the local emulator. Use a disposable Floci volume for integration testing.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Roadmap](ROADMAP.md) · [MIT license](LICENSE)

Early release: expiry remains best-effort and removing an AWS assignment does not invalidate all existing role sessions. Existing access is preserved rather than temporarily elevated and restored. Use a single host with a durable SQLite volume. Databases from the previous prototype are left untouched and are not migrated automatically.

To check the actual non-root web/worker containers against the same Floci instance, first build `docker build -t access-harbor:local .`, then set `CONTAINER_TEST_IMAGE=access-harbor:local` and `FLOCI_TEST_ENDPOINT=http://localhost:4566` when running tests. `DOCKER_BIN` and `FLOCI_DOCKER_NETWORK` can override the CLI path and local network.
