# OpenTech Academy production plan

## Current state

The public site is a static HTML/CSS/JavaScript site. Cloudflare Workers Static Assets remains the delivery layer. Better Auth with the Convex component is scaffolded for email/password sign-in, but the existing Convex deployment environment must be configured and the integration deployed before sign-in is live. Enrollment, learner-progress sync, analytics, protected media, payments, and certificate verification are not production features yet.

The existing canonical host remains `opencomp.academy` until the owner configures and confirms the production domain. A brand change does not transfer or configure a domain. Before launch, replace that origin consistently in canonical links, structured data, `robots.txt`, and `sitemap.xml`, and verify DNS and TLS.

## Proposed architecture

| Concern | Service | Production boundary |
| --- | --- | --- |
| Public course catalog and static frontend | Cloudflare Workers Static Assets | Deploy this repository with `npx wrangler deploy`; use a dedicated production domain and preview deployments. |
| Application data and server functions | Convex | Store users' enrollments, progress, assessment attempts, and certificate records. Authorize every mutation from the verified identity inside the function. |
| Authentication and sessions | Better Auth with the Convex maintained integration | Use the Better Auth Convex component and official provider. Keep secrets in Convex deployment environment variables. Do not trust a browser-supplied user ID. |
| Owned course PDFs, worksheets, and uploads | Private Cloudflare R2 bucket | Keep the bucket private. Grant short-lived, object-specific download/upload URLs only after checking course entitlement. Never ship R2 credentials to the browser. |
| Publicly licensed media | Original publisher / provider | Embed or link to the publisher, with attribution and license recorded. Do not mirror copyrighted media into R2 without permission. |
| Product analytics | PostHog | Track a minimal event set. Never send email, passwords, private notes, quiz answers, or course content as event properties. Disable or consent-gate session replay on authenticated learning screens. |

### Learner data flow

1. Better Auth establishes the session; the Convex integration supplies the authenticated identity to Convex.
2. Convex functions derive the user from `ctx.auth` and check access on every read or write. The client may submit a course/lesson identifier but cannot choose the owner identity.
3. Progress is saved per user, course version, and lesson. Preserve a local anonymous draft only as an opt-in migration path after sign-in; the server record becomes authoritative.
4. A protected-material request checks enrollment/entitlement before the backend issues a short-lived R2 URL. Do not treat an R2 URL as a durable credential.
5. Certificate eligibility is calculated from server-side completion records. Issuance and verification need a unique, non-guessable verification ID and immutable issue record. Any certificate fee must be disclosed before checkout; payment is not wired yet.

## Deployment setup

1. Connect the Git repository to the Cloudflare account and confirm the production branch and domain.
2. Install the current Wrangler CLI in a lockfile-managed development setup; use `npx wrangler dev` to preview and `npx wrangler deploy` to deploy the static site.
3. Confirm the deployment serves nested course URLs and JSON course content, and that the custom headers in `_headers` are present on static responses. Worker-generated API responses need their own headers if/when a Worker API is added.
4. Create separate Convex development and production deployments. Configure the Better Auth secret, site origin, and any email/social-provider credentials per deployment. Keep production credentials out of Git and browser bundles.
5. Create a private R2 bucket for original assets. Add least-privilege credentials only to the backend that issues signed URLs; enable CORS only for the exact production and local origins and required methods/headers.
6. Configure a PostHog project and region. Add the browser SDK only after privacy/cookie decisions and consent behavior are agreed; the site currently sends no PostHog events.
7. Add deployment secrets to the chosen CI provider. Use Convex preview deployments for PRs and the production deployment only from the protected production branch. Do not make a production deploy until secrets, domain, privacy policy, and recovery/backup procedures are in place.

## Launch gates

- Replace demo login and browser-only progress with Better Auth + Convex; enforce authorization in backend functions.
- Set up email verification, password reset, rate limits, account deletion/export, and a support process.
- Finish the mobile/accessibility pass, remove inline CSS and redirect scripts, then tighten CSP by removing `'unsafe-inline'`.
- Define the privacy notice and consent rules for PostHog, cookies, session replay, and retention.
- Record source licenses/attribution and validate each external video, reading, and downloadable PDF before publishing.
- Add application monitoring, error reporting, backups/restore practice, deployment rollback instructions, and incident contacts.
- Configure an actual payment provider and certificate issuance/verification only after pricing, taxes, refunds, and customer-support policies are decided.
- Configure the production domain and update canonical URLs, sitemap, robots, email sender, auth callback allowlists, and analytics settings together.

## Cloudflare headers

`_headers` applies to Workers Static Assets responses. The current policy is transitional because existing legacy redirect pages contain inline JavaScript and several pages contain inline `style` attributes. Once those are removed, tighten the policy to disallow inline script and style. If the project adds Worker-generated API routes, set headers in those Worker responses too; `_headers` does not cover Worker-generated responses.

## Decisions still needed for a real launch

- Production domain and whether the current `opencomp.academy` hostname remains.
- PostHog region and whether analytics/session replay may run before explicit consent.
- R2 use cases: only OpenTech-authored downloadable files, or user uploads as well.
- Email delivery provider and sign-in methods.
- Certificate price, payment provider, refund/tax policy, and certificate-verification page.
