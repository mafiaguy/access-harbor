# Roadmap

These are proposals, not delivery promises.

## v0.1 · Foundation

- Node.js requester wizard and separate administrator inbox.
- OIDC login, guided environment setup, diagnostics and on-screen guide.
- GitHub App and AWS IAM Identity Center direct grants.
- Durable expiry, retries, async AWS operations, notifications and audit history.
- Single-host containers, tests and CI.

## Next · Safe rollout

- Validate live integrations against documented tenant configurations.
- Test the container and HTTPS example on Linux; publish reproducible releases and an image with provenance.
- Harden request/provider reconciliation and long-operation lease handling.
- Dedicated revocation monitoring and operator recovery actions.
- Explicit schema migrations, backup and restore tooling.

## Then · Team administration

- Admin UI for resource catalog, identity mappings and approver groups.
- Configurable policies, multiple approvals, reasons/ticket links and notifications.
- Safe temporary elevation with baseline permission restoration and drift detection.
- Audit export and external monitoring integrations.

## Later · Broader platform

- PostgreSQL-backed queue and supported HA deployment.
- Provider-specific active-session revocation and stricter deadline enforcement.
- More SCM and SaaS adapters under a versioned provider contract.
- Packaging and identity-provider-specific onboarding improvements.
