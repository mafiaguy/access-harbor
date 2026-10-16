# OpenTech Academy

OpenTech Academy makes practical computer education clear and connected. Courses cover systems foundations, security, cloud engineering, site reliability, and software deployment.

## Run locally

Install the pinned dependencies, then run the Vite development server:

```sh
pnpm install
pnpm dev
```

Open <http://127.0.0.1:8000>. The sign-in screen is wired to Better Auth and the configured Convex deployment. Before it can accept accounts, configure the deployment environment listed below. The learning pages still store lesson progress in the current browser; synced enrollment, payment, and certificate issuance are not connected.

## Structure

- `index.html`, `styles.css`, `brand.css`, `app.js`, `catalog.js` — public company homepage, responsive design, and course search.
- `courses/<slug>/index.html` — public, crawlable course detail pages.
- `courses/<slug>/course.json` — course-specific lessons, written explanations, checks, guided activities, curated publisher resources, and Awesome-list discovery sources.
- `lms/<slug>/` — shared lesson-by-lesson learner view with local preview progress and course completion state.
- `convex/`, `auth-client.js`, `lms/start.html` — Better Auth email/password sign-in backed by the Convex Better Auth component.
- `courses/COURSE_TEMPLATE.md` — guidance for adding courses with consistent page structure.
- `robots.txt`, `sitemap.xml`, `favicon.svg` — public indexing and site identity.
- `docs/repo-access-automation.md`, `.github/workflows/`, `scripts/`, `grants.json` — repository access automation preserved from the original repository.

## Course and certificate model

Course learning is designed around curated, attributed resources and practical work. Learning access is intended to be free. A course completion certificate is optional, offered after course requirements are met, and requires a separate fee. The certificate price, actual authentication and enrollment, payment processor, content hosting, and verification service need to be configured before launch.

The five learning spaces cover Security 101, Computer Systems Foundations, Cloud Engineering, Site Reliability Engineering, and DevOps & Deployment. Each has original notes, checks, activities, and optional links to publisher videos/readings. A completed preview shows the planned certificate step, but cannot start checkout or issue an award. See the researched source map in [curriculum/awesome-list-map.md](curriculum/awesome-list-map.md).

## Curriculum contributions

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [courses/COURSE_TEMPLATE.md](courses/COURSE_TEMPLATE.md). Link to third-party resources rather than rehosting them, and confirm attribution, access, licensing, and embedding terms.

## Hosting

The site is configured for Cloudflare Workers Static Assets in `wrangler.jsonc`. Build the static site and bundled auth client before previewing or deploying:

```sh
pnpm build
pnpm exec wrangler dev
pnpm exec wrangler deploy
```

Set the Convex deployment's `SITE_URL`, `CONVEX_SITE_URL`, and generated `BETTER_AUTH_SECRET` before enabling sign-in. Add the matching public Vite variables to the deployment build environment. The current canonical URLs still use `https://opencomp.academy/`; update page metadata, structured data, `robots.txt`, and `sitemap.xml` together after the production domain is confirmed. See [docs/production-readiness.md](docs/production-readiness.md) for remaining launch gates. Analytics, R2, payments, synced progress, and certificate services are not connected.

The syllabus and source-linked videos, PDFs, and readings for the five current courses live in [curriculum/research-and-resources.md](curriculum/research-and-resources.md). The GitHub discovery lists and upcoming topic roadmap are in [curriculum/awesome-list-map.md](curriculum/awesome-list-map.md). The material is curated and attributed; third-party content remains hosted by its publisher unless redistribution permission is documented.

## License

Choose and add a project license before accepting broad external contributions. Educational content and application code should have explicit, compatible licensing.
