# Awesome list curation map

Awesome repositories are discovery indexes. They help us find curriculum topics and publisher materials; they are not themselves a license to copy or a finished syllabus. OpenTech authors the lesson explanations, activity prompts, checks, and sequence. The LMS links to original resources and embeds public video or PDF viewers where the publisher permits it.

## Sources and how they inform the courses

| Course | Repositories supplied for curation | What the lists contribute |
| --- | --- | --- |
| Site Reliability Engineering | [dastergon/awesome-sre](https://github.com/dastergon/awesome-sre), [awesome-sre/awesome-sre](https://github.com/awesome-sre/awesome-sre) | The first indexes SRE books, articles, talks, observability, incident response, and capacity planning. The second is primarily an SRE tool catalog. Lessons use the books and selected monitoring/incident readings; tools are examples, not required installs. |
| Cloud Engineering | [JStumpp/awesome-cloud](https://github.com/JStumpp/awesome-cloud), [icherkas/awesome-cloud-projects](https://github.com/icherkas/awesome-cloud-projects) | The first catalogs cloud services across SaaS, PaaS, and IaaS. The second indexes cloud architecture recipes and projects. They support service comparison and optional capstone examples; vendor documentation and videos provide the instructional detail. |
| DevOps & Deployment | [awesome-soft/awesome-devops](https://github.com/awesome-soft/awesome-devops), [wmariuss/awesome-devops](https://github.com/wmariuss/awesome-devops), [awesome-devops/awesome-devops](https://github.com/awesome-devops/awesome-devops) | These lists map tools and practice areas. The wmariuss list also points to learning resources such as DevOps Roadmap and books. Course lessons use those for orientation, then point to the original Git, CI, container, deployment, and reliability documentation. |
| Security 101 | [sbilly/awesome-security](https://github.com/sbilly/awesome-security), [okhosting/awesome-cyber-security](https://github.com/okhosting/awesome-cyber-security) | Broad indexes of security tools, books, documents, talks, and learning resources. We select defensive, beginner-appropriate material and keep hands-on work inside the course's fictional or local scenarios. The conference-talk index linked from awesome-security is optional enrichment, not a required path. |
| Computer Systems Foundations | [ossu/computer-science](https://github.com/ossu/computer-science), [CSwala/awesome-computer-science](https://github.com/CSwala/awesome-computer-science), [Developer-Y/cs-video-courses](https://github.com/Developer-Y/cs-video-courses) | OSSU provides a structured CS path; CSwala is a broad topic index; Developer-Y curates university video courses. The systems and networking lecture videos selected from the list are embedded in the relevant lessons, with Linux and MIT resources retained for beginner foundations. |

## In-course media behavior

- `video` resources use an embedded YouTube or Vimeo player when the source supports embedding. YouTube playlist URLs render through the playlist player so a course series can stay in the lesson.
- Direct publisher PDFs are shown in the lesson PDF viewer. A publisher article stays a source-linked reading because not every site allows itself to be framed inside another site.
- A publisher article, YouTube video, or PDF embed can be disabled by its publisher, region, or browser. The original source link remains alongside the viewer.
- Never copy videos, articles, or PDFs into R2 unless their license explicitly permits redistribution. A public link or an Awesome-list entry does not grant that permission.
- Recheck each publisher link and embed before a course release. Repositories can move, become stale, or change their contents.

## Current course paths

| Course | Current outcome |
| --- | --- |
| Security 101 | Explain core security risks and produce a bounded risk review for a fictional service. |
| Computer Systems Foundations | Trace a browser request and document a working development environment. |
| Cloud Engineering | Review a small cloud architecture across identity, network, cost, resilience, and operations. |
| Site Reliability Engineering | Define service indicators and objectives, investigate a simulated incident, and write a runbook. |
| DevOps & Deployment | Design a controlled build and deployment flow with rollback and a release runbook. |

The LMS currently stores progress in localStorage. Authentication, server-synced progress, paid certificates, and certificate verification still require backend implementation.
