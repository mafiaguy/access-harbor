# Contributing

Thanks for helping make temporary access easier to operate. Start with a small bug fix, documentation improvement, or a tested provider adapter.

## Local development

1. Install Node.js 24+.
2. Run `npm ci`, start Floci with `docker compose -f compose.floci.yaml up -d`, then run `npm run setup` and choose local.
3. Make a focused change. JavaScript ES modules and server-rendered pages are intentional: keep the project easy to read and run.
4. Run `npm run format`, `npm run check` and `npm test`.
5. For UI changes, verify the requester and admin flow at desktop and narrow widths. Update the screenshot if it materially changes.

`npm run dev` watches the web process using your `.env`; run `npm run worker` separately. Local AWS clients target only the configured Floci endpoint. GitHub is real even in a local deployment; use dedicated repositories. Tests use isolated fixtures inside the test directory, never a shipped fake-login endpoint.

## Pull requests

Explain the problem, resulting behavior, and validation. Provider changes must include failure, retry, preexisting-access and revocation tests. Do not claim production support based only on a mocked test. Keep changes backward compatible or include a tested migration and upgrade instructions.

Never commit `.env`, private keys, actual identity mappings, runtime databases, or unredacted logs. Report vulnerabilities privately as described in SECURITY.md. Ordinary bugs and feature proposals can use the issue templates once the repository is published.

## Project scope

The first release is a small, self-hosted product for direct temporary grants. Use ROADMAP.md for planned work. Proposals for baseline restoration, HA, or new providers should explain ownership, revocation and failure semantics before implementation.

Maintainers review contributions for correctness, operability, and understandable code. Be constructive, respect other contributors, and keep disagreement focused on the work. Participation does not imply a response-time or support SLA.
