# OpenTech Academy curriculum and resource map

This is a researched, source-linked curriculum plan for the five catalog courses. It defines a substantial but bounded course rather than promising an unrealistic 12–16 week duration for a short survey. Each module should become four short lessons, one knowledge check, and one practical artifact inside the LMS. Videos, readings, and PDFs below are links to original publishers; availability and licensing must be checked again before each course release. Do not copy a publisher's video or PDF into R2 unless the license permits it.

## Course design standard

- Lessons: 10–20 minutes of original OpenTech explanation, followed by a source-linked optional reading/video and an in-course task.
- Courses with local labs: 12–20 hours total, typically 3–5 weeks at 4 hours/week. Security 101 remains a 4–6 hour overview. Computer Systems Foundations is 18–24 hours because it assumes no technical experience.
- Each course ends with a portfolio artifact and a rubric. A completion certificate can only be offered after a real server-tracked completion flow and disclosed purchase flow exist.
- Use safe local/sandboxed labs. Security exercises target intentionally vulnerable local applications only; no scanning or testing real systems without explicit authorization.

## 1. Security 101 — 4–6 hours, breadth-first

**Audience:** learners who need a map of security concepts before specializing. **Capstone:** a concise risk review of a fictional course service.

1. Security goals and risk: confidentiality/integrity/availability; assets, threats, weaknesses, likelihood, impact, controls.
2. Systems and trust boundaries: processes, least privilege, network request path, DNS/HTTP/TLS, threat-model diagrams.
3. Identity and data: authentication vs authorization, MFA, sessions, secrets, encryption in transit/at rest, backups.
4. Application and operational security: input handling, access control, dependency risk, secure configuration, logging, incident response, recovery.

**Core resources:** [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework) (overview and downloadable framework PDF); [NIST CSF 2.0 Quick-Start Guides](https://www.nist.gov/cyberframework/quick-start-guides) (including small-business and supply-chain guides); [OWASP Top 10](https://owasp.org/www-project-top-ten/); [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/); [OWASP Web Security Testing Guide v4.2](https://owasp.org/www-project-web-security-testing-guide/) (web edition and PDF); [NIST SP 800-61 Rev. 3 incident response](https://csrc.nist.gov/pubs/sp/800/61/r3/final).

**Video source:** [NIST CSF 2.0 resources and videos](https://www.nist.gov/cyberframework); [OWASP Video Portal](https://videos.owasp.org/). Select one current introductory talk per release and link to its original host.

## 2. Computer Systems Foundations — 18–24 hours, beginner

**Audience:** learners starting from zero. **Capstone:** document a personal development environment and trace a browser request from name lookup to response.

1. Digital systems: data representation, CPU, memory, storage, peripherals, operating-system role.
2. Operating systems: processes, filesystems, users, permissions, applications, resource use, safe troubleshooting.
3. Linux essentials: shell, paths, files, pipes, processes, package managers, permissions, shell scripts.
4. Networks and the web: LAN/WAN, IP, ports, DNS, routing, HTTP, TLS, browser/server requests.
5. Programming and collaboration: variables, control flow, functions, reading errors, Git, branches, commits, README and issue reporting.
6. Systems integration: environment variables, logs, basic backup, troubleshooting method, final system map.

**Video + lecture notes + assignments:** [MIT OCW Introduction to Computer Science and Programming in Python](https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/) (lecture videos, notes, problem sets, and assignments; MIT OCW identifies the material as intended for learners with little or no programming experience). A newer [MIT OCW introductory programming collection](https://ocw.mit.edu/collections/introductory-programming/) is useful for selecting a current replacement.

**Linux course/video/PDF:** [Linux Foundation Introduction to Linux](https://training.linuxfoundation.org/training/introduction-to-linux/) and its [course outline PDF](https://courses.edx.org/asset-v1%3ALinuxFoundationX%2BLFS101x%2B1T2017%2Btype%40asset%2Bblock/LFS101x_-_Introduction_to_Linux_Outline.pdf). Confirm current audit availability and the PDF's current version before publication.

**Book:** [Operating Systems: Three Easy Pieces](https://pages.cs.wisc.edu/~remzi/OSTEP/) provides a free online OS textbook, organized by chapter. Its downloadable compiled PDF is paid, so the course links to the free chapter pages and does not label it as a free PDF.

**Web reading:** [MDN HTTP overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview), [Cloudflare DNS learning center](https://www.cloudflare.com/learning/dns/what-is-dns/), and [GitHub's Git introduction](https://docs.github.com/en/get-started/using-git/about-git).

## 3. Cloud Engineering — 12–16 hours, foundations to guided architecture

**Audience:** developers, support/IT learners, and aspiring platform engineers. **Capstone:** architecture, threat, cost, and operations review for a small web service.

1. Cloud concepts: shared responsibility, service models, regions/zones, elasticity, consumption, resilience and provider tradeoffs.
2. Compute and application runtime: VMs, containers, serverless, scaling, health checks, runtime configuration.
3. Networking and edge: VPC/VNet, subnets, routing, DNS, firewalls, load balancing, CDN, TLS.
4. Storage and data: object/block/file storage, databases at a conceptual level, durability, backup, lifecycle, data classification.
5. Identity, security, governance and cost: IAM, least privilege, secrets, encryption, policy, budgets, tagging, shared-responsibility review.
6. Operate and design: logs/metrics, availability objectives, failure scenarios, architecture diagram, cost assumptions, runbook.

**Video/learning path/PDF sources:** [Microsoft Azure Fundamentals paths](https://learn.microsoft.com/en-us/training/paths/azure-fundamentals/) include beginner modules on cloud concepts and Azure services; [Microsoft's cloud concepts path](https://learn.microsoft.com/en-us/training/paths/azure-fundamentals-describe-cloud-concepts/) is a short entry point. [AWS Overview whitepaper](https://docs.aws.amazon.com/whitepapers/latest/aws-overview/introduction.html) is the provider's maintained service overview and offers a PDF. [Google Cloud Well-Architected Framework](https://docs.cloud.google.com/architecture/framework) is a maintained design reading. [Google Cloud architecture video playlist](https://cloud.google.com/developers/architecting-with-google-cloud) supplies optional case-study videos.

**Vendor-neutral reading:** [Cloudflare Learning Center: the cloud](https://www.cloudflare.com/learning/cloud/what-is-the-cloud/) explains cloud concepts and embeds an introductory video. Teach core concepts provider-neutrally before mapping them to any one vendor.

## 4. Site Reliability Engineering — 14–18 hours, applied operations

**Audience:** developers and operations learners who understand basic Linux and networking. **Capstone:** define an SLI/SLO, build a small dashboard from sample telemetry, and run a tabletop incident review.

1. Service operations: service boundaries, user journeys, dependencies, failure modes, toil, operational ownership.
2. Reliability objectives: availability/latency/correctness, SLIs, SLOs, error budgets, risk tradeoffs.
3. Observability: metrics, logs, traces, symptom-based alerting, dashboards, debugging hypotheses.
4. Incidents and learning: severity, roles, communication, mitigation, timelines, blameless reviews, follow-up quality.
5. Change and resilience: progressive delivery, rollback, overload, redundancy, backups, capacity and load testing.
6. Automation and capstone: safe toil reduction, runbooks, production readiness review, service reliability presentation.

**Reading/book PDF source:** [Google SRE books](https://sre.google/books/) provide the complete *Site Reliability Engineering* and *Site Reliability Workbook* online; use the chapters on SLOs, monitoring, toil, incident response, and postmortems. Google also provides a [book update resource index](https://sre.google/resources/book-update/) pairing chapters with later talks and workshops.

**Videos:** [Google SRE video library](https://sre.google/resources/videos/) includes talks tagged across observability, SLOs, incidents, and automation. Select a short video and pair it with a written activity; avoid relying on video alone.

## 5. DevOps & Deployment — 14–18 hours, hands-on delivery

**Audience:** learners with basic command-line and Git familiarity. **Capstone:** deliver a small sample application through a tested pipeline, container image, deployment plan, health check, and rollback exercise.

1. Team flow and Git: small changes, branches, review, merge conflicts, tags, release notes.
2. Build and test automation: CI triggers, reproducible builds, unit checks, artifacts, caches, failure diagnosis.
3. Pipeline security: least-privilege workflow tokens, secrets, pinned dependencies, permissions, supply-chain provenance.
4. Containers: image layers, Dockerfile, build/run, ports, volumes, environment configuration, health checks, image scanning.
5. Deployment: environments, configuration separation, blue/green and canary concepts, rollback, infrastructure as code overview.
6. Operate and improve: logs/metrics, delivery feedback, deployment safety, DORA measures, capstone demo and runbook.

**Videos/official labs:** [GitHub Actions tutorials](https://docs.github.com/en/actions/tutorials) and [GitHub Actions quickstart](https://docs.github.com/en/actions/get-started) provide workflows learners can run in their own repositories. [Docker Get Started](https://docs.docker.com/get-started/) is the maintained Docker learning path. [Kubernetes tutorials](https://kubernetes.io/docs/tutorials/) and [Kubernetes Basics](https://kubernetes.io/docs/tutorials/kubernetes-basics/) are optional next-step labs; keep Kubernetes out of the core requirement for this introductory course.

**Reading/PDF:** [Google SRE: Release Engineering](https://sre.google/sre-book/release-engineering/) connects release practices to reliability. [SLSA documentation](https://slsa.dev/) introduces software supply-chain integrity. Official product docs change frequently, so link to the live source rather than copying PDFs.

## Additional courses to add after the five

1. **Application Security Engineering** — secure design, code review, OWASP ASVS/WSTG, threat modeling, secure CI, remediation verification. Build on the official OWASP ASVS and WSTG; keep testing inside an authorized lab.
2. **Cloud Security Engineering** — IAM, network boundaries, secrets, logging, policy-as-code, supply-chain controls, cloud incident response. Reuse the Cloud Engineering prerequisites and NIST CSF/Cloud provider guidance.
3. **Networking Fundamentals** — addressing, subnetting, DNS, routing, TCP/UDP, TLS, HTTP, firewall policy, packet analysis in a local lab.
4. **Data Engineering Foundations** — SQL, data modeling, batch/streaming concepts, orchestration, data quality, access control, privacy, observability.
5. **AI Systems Engineering** — model/API integration, evaluation, data boundaries, reliability, monitoring, threat modeling, cost and deployment; author only after scope and safety review.

Do not publish additional course cards as “available” until each has a complete curriculum, verified source list, assessed practical outcomes, realistic effort estimate, and working learner flow.

## Source and rights review checklist

For each link, record publisher, content title/version, access date, format (video, web reading, PDF), price/access conditions, license or terms, whether embedding is allowed, accessibility/transcript availability, and the exact lessons it supports. Link directly to a public publisher page. Keep third-party PDFs hosted by their publisher unless explicit redistribution permission is documented. Prefer captions/transcripts and provide an equivalent text lesson.
