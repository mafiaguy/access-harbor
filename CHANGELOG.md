# Changelog

## 0.1.0 · Unreleased

Initial Node.js open-source project:

- Removes built-in accounts and the automatic-success provider; local AWS uses Floci SDK endpoints.
- Loads application secrets exclusively from Secrets Manager, including in-memory GitHub PEMs.
- Adds operator-supplied Cognito enrollment, SES delivery and Floci integration tests for OIDC, grant and expiry.

- Replaces the Python prototype with Node.js 24, Express, EJS and built-in SQLite.
- Simplifies the product into My access, a three-step request wizard, Review requests, and Setup.
- Adds interactive setup, local/online diagnostics, on-screen help and environment walkthroughs.
- Adds OIDC sign-in, GitHub App and AWS Identity Center provider adapters.
- Persists asynchronous operations, durable retries, email notifications, early revocation and worker readiness.
- Adds an MIT license, contribution/security guides, issue/PR templates, automated tests, and CI.

No public release, container publication, or production certification has occurred. The Python prototype database is not migrated automatically.
