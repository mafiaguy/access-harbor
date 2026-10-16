# Troubleshooting

Start with `npm run doctor`, then look at the admin Setup page and worker logs. Never paste secrets or unredacted identity mappings into a public issue.

| Symptom | Check |
| --- | --- |
| `node:sqlite` cannot be imported | Install Node.js 24+. Check `node --version`. |
| Port 3000 already in use | Stop the other service or configure PORT and PUBLIC_URL consistently and restart. |
| App opens but approval stays “Setting up access” | Start the worker. In Compose, check `docker compose logs worker`. |
| Login loops after OIDC callback | HTTPS proxy must supply `X-Forwarded-Proto: https`; ensure PUBLIC_URL and callback domain match. |
| “Your account is not enrolled” | Check the exact client-specific OIDC `sub` and verified email in identities.json; restart both services. |
| Verified email required | Configure the IdP to issue `email_verified: true` as a boolean in ID tokens. Do not weaken verification in application code. |
| Admin cannot see Review requests | ADMIN_EMAILS must contain their verified email, and that identity must be enrolled. |
| Admin cannot approve own request | Expected. Ask a different administrator. |
| No approval email | Check SMTP TLS/port/auth, sender authorization, provider delivery logs, spam folder and the outbox error count in Setup. Run online doctor. |
| GitHub returns 403/404 | Check App installation scope, Administration write permission, installation ID, private key in Secrets Manager and organization collaboration policies. |
| GitHub says access ready but repository is inaccessible | Accept the repository invitation while signed in to the enrolled GitHub username. |
| Existing-access warning | Expected. v0.1 preserves preexisting access. Use a dedicated test resource or plan a future baseline-elevation workflow. |
| AWS AccessDenied | Verify worker workload credentials, Identity Center home region, delegated administration and all required IAM actions. Execution role alone is not an ECS task role. |
| AWS permission is still usable after removal | Existing sessions or other group/role grants may still authorize it. Assignment removal does not revoke all active sessions. |
| “Removing access” with warning | Treat the grant as still present. Fix provider reachability/permissions, monitor retries, and remove manually if urgent while retaining the audit record. |
| Readiness endpoint is 503 | Worker heartbeat is stale or a grant is overdue by over one minute. The web liveness endpoint is not evidence of expiry health. |
| SQLite read-only/permission error | Ensure the data directory is writable by container UID 1000, on a locking-capable local volume. |
| Database belongs to another mode | Use a different database for local and production. Do not change metadata to bypass this check. |

## Where are logs?

```sh
docker compose logs --tail=100 web
docker compose logs --tail=100 worker
```

Direct Node services log to stdout/stderr. Preserve these in your process supervisor. User-facing provider errors are intentionally generic; the worker records the provider error message for operators. Redact identities, resource names and any sensitive metadata before sharing logs.

## How do I recover from an outage?

Keep the persistent database. Restore provider credentials/connectivity, then restart the worker. It resumes unfinished work and expiry checks. Do not “fix” a stuck grant by deleting its row, deleting the volume, or marking it expired manually: that loses the revocation schedule or falsely reports success. Reconcile manually with the provider if necessary and preserve a separate incident record.

If the database itself is lost, restore the backup and compare provider state with recorded grants before restarting mutations. A backup is not proof of current permissions; changes since the backup require reconciliation.

## Secrets Manager or Floci unavailable

The web process serves a setup-required page with 503 while configuration cannot be loaded; the worker refuses startup. Check that Floci is running, SECRETS_MANAGER_SECRET_ID points to an existing JSON bundle, and APP_ENV is local for Floci. In production check workload role permissions, the bundle region and optional KMS permissions. Do not add credentials to .env as a workaround: those sources are rejected. SDK exception bodies and secret contents are intentionally not printed.
