# Course authoring template

To add a course, copy an existing page such as `courses/cloud-engineering/index.html`, then replace the metadata, intro, learner outcomes, syllabus modules, and project with course-specific content. Keep the shared class names and stylesheet links so the responsive layout and interaction patterns remain consistent.

## Required page content

- Stable slug under `courses/<slug>/` and a canonical URL.
- Plain-language course purpose and intended learner.
- Prerequisites, level, and honest time estimate.
- Measurable learning outcomes.
- Ordered modules with enough detail to explain progression.
- A practical final project or demonstration.
- Links to attributed resources, with license and access checked.
- An explicit statement about course access and any optional certificate fee.

## Course resources

Use `courses/security-engineering/course.json` as the initial LMS content shape. Lessons should distinguish original OpenTech explanations from external resources. Link to third-party videos, documentation, articles, and PDFs; do not rehost copyrighted material without permission. Required materials should be free to access.

Keep the learner flow lightweight: a clear lesson, one quick knowledge check, and one focused practice activity inside the course. Do not require a repeated written reflection or worksheet to unlock the next lesson. Add writing only when it produces a useful course artifact, and make it optional unless it is essential to the stated outcome.

Use Awesome lists on GitHub as discovery indexes, not as course content or proof of license. Record the chosen list URLs in the course JSON `curationSources` field. Select individual publisher resources only after checking relevance, access, attribution, licensing, and embedding terms. Write original OpenTech notes and activities; link to the source rather than copying or rehosting it.

## LMS integration

The five current learning spaces share `lms.js` and load course-specific JSON. Better Auth and Convex are being connected for sign-in; their progress remains browser-local until server syncing is implemented. Do not present local completion as certificate eligibility. Connect authenticated enrollment, server-recorded assessments, payment confirmation, and certificate verification before enabling checkout or issuance.
