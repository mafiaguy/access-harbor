# Security and operational boundaries

Access Harbor manages permissions. v0.1 is an early open-source release, not a security-audited enterprise PAM service. Complete the live smoke test and review these boundaries before deployment.

## Reporting

Do not post working exploits, credentials, tenant identifiers, or private keys in public issues. When this repository is published, enable GitHub private vulnerability reporting and use its **Security → Report a vulnerability** flow. Until a private reporting channel is configured, contact the repository owner privately before disclosing sensitive details. There is no promised response SLA in this initial project.

## Controls included

- OIDC code flow with PKCE, state, nonce and ID-token validation through openid-client.
- Verified email plus explicit subject/email enrollment. Administrator allowlist checked server-side.
- Persistent, regenerated sessions; Secure cookies on HTTPS deployments; form CSRF checks and Helmet headers.
- Server-side resource, permission and duration validation; request ownership and self-approval enforcement.
- Durable request, audit, outbox and asynchronous provider-operation state.
- New requests refuse to take ownership of existing GitHub access/invitations or existing direct AWS assignments.
- GitHub App credentials and AWS SDK workload credentials stay server-side; users receive no SCM token/key.
- Environment-bound databases prevent local records from being reused in production.

## Limits you must account for

1. **Expiry is best-effort.** The five-second poll, provider API latency, throttling, retry backoff, queue length and downtime can delay removal. Alert on readiness/overdue grants. A hard cutoff requires provider-specific fail-closed enforcement beyond this release.
2. **AWS sessions can outlive assignment removal.** Use short sessions and your own session revocation/enforcement policy. Other group assignments and roles may independently confer access.
3. **GitHub data already downloaded cannot be recalled.** Removing a direct grant cannot remove access inherited elsewhere. The app does not proxy Git operations or revoke a user's own credentials.
4. **Exclusive grant ownership is required.** There is no atomic transaction across SQLite and a provider. Ownership intent and retries reduce crash gaps but cannot distinguish every out-of-band change. Do not let another tool or administrator modify a user/resource grant while Access Harbor manages it; expiry could remove that competing change. Use dedicated permission sets/resources and reconcile incidents manually.
5. **No existing-access elevation in v0.1.** It does not snapshot and restore baseline repository permissions. Preexisting direct grants are rejected rather than overwritten.
6. **Audit history is not tamper-proof.** Application paths append events, but a database/host operator can change them. Export to immutable external storage if your policy requires it.
7. **Single-host persistence.** SQLite, leases and a local volume do not provide multi-host HA or disaster recovery. Keep one supported worker; lease expiry is not a guarantee against arbitrarily long provider operations. Back up and test restore.
8. **Configuration is privileged.** Protect the Secrets Manager bundle, .env metadata, identity mappings and catalog. The included services share secret-bundle access; this is not a hardened separation of web and worker trust boundaries. Restrict host access and use a secret manager/task role.
9. **Authorization changes need restarts.** User/provider mappings and the admin list are read at startup. Restart both services to apply changes; revoke IdP access and terminate sessions according to your incident policy.
10. **SMTP is at least once.** Retries can duplicate an email after a crash. Provider failures remain visible; do not treat a sent email or successful HTTP response as proof of revocation.

Keep dependencies current, require MFA in the IdP, restrict GitHub App scope and AWS permissions, and monitor both processes. Do not expose Floci publicly or deploy production without HTTPS. Never destroy the data volume while live grants are outstanding.

## Secret sources

Application secrets are loaded only from Secrets Manager at startup, held in process memory and never copied into environment files or rendered. GitHub PEMs are read from the bundle, not mounted files. Production rejects plaintext application-credential environment variables, Floci endpoint overrides and static AWS access-key environment variables; provide workload identity as the bootstrap trust source. Local SDK signing values are non-secret emulator credentials confined to local Floci endpoints. Rotate the bundle then restart both processes. Changing SESSION_SECRET invalidates sessions. User passwords are owned by the identity provider, not the application.
