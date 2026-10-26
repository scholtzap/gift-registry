---
name: repo-architecture
description: >-
  Creates or updates git-root ARCHITECTURE.md from a living 11-section template
  so agents onboard without re-exploring the repo. Use when ARCHITECTURE.md is
  missing or a stub, before deep work in an unfamiliar repo, after structural /
  data-store / deploy / integration changes, or when the user asks to document
  architecture. Complements graphify, AGENTS.md, MISTAKES.md, WISHLIST.md, and
  repo-memory — does not replace them.
---

# repo-architecture

Write **git-root** `ARCHITECTURE.md` so the next agent can contribute on day one without a wide glob of the tree.

Canonical ops: `bike-tracker/docs/operations/AGENT_KNOWLEDGE_ECOSYSTEM.md`  
Section order and headings: [template.md](template.md) (**verbatim** — do not rename, reorder, or drop numbered sections).

## When to run

- `ARCHITECTURE.md` missing, marked **stub**, or `Date of Last Update` older than a known structural change
- User asks to document architecture / onboard agents / “how is this repo put together?”
- After adding/removing a service, data store, host, CI path, or major directory
- A `WISHLIST.md` `quickref` / `inefficiency` item is “I had to explore to find X” — fold X into the right section **in this run** when cheap

Do **not** run for a one-line code fix in a repo whose map is already current.

## Ecosystem (do not conflict)

| Tool | Role vs this file |
|------|-------------------|
| **graphify** (`/graphify`, per-repo `graphify-out/`) | Generated graph of *code* relationships. Cite `GRAPH_REPORT.md` from §2. Do not paste `graph.json`. Do not skip this doc because a graph exists. Run graphify **in the target repo CWD** only (`docs/strategy/GRAPHIFY.md`). |
| **AGENTS.md** | Behaviour and commands. Point to it from §8; do not copy session-start rules here. |
| **MISTAKES.md** | Failures. Link from §9 if a debt *is* a known incident; do not move postmortems here. |
| **WISHLIST.md** | Gaps. If §1–11 is missing a pointer you had to hunt for, add the pointer **and** close/fulfill the wish. |
| **docs/plans/** | Product work queue. §9 may *name* a SPEC; do not duplicate the SPEC. |
| **repo-memory** | After writing, upsert `memory_key=architecture-map` (category `architecture`) with a 5-bullet summary + path to this file. No secrets. |
| **Notion Eng KB** | Mirror via CI / `/doc-kb-save` when the repo syncs root markdown; git remains SoT. |

Cross-repo edges (portal → API GW → Lambda) belong as **short text in §2**, not a mega-graph at the umbrella root.

## Workflow

Copy this checklist:

```
- [ ] 1. Confirm git root (not umbrella Documents/3bo unless that folder is itself a git repo)
- [ ] 2. Read existing ARCHITECTURE.md — update in place unless it is a stub or empty template
- [ ] 3. Skim README.md, AGENTS.md, serverless.yml / package.json / wrangler.toml / Dockerfile
- [ ] 4. Build a real directory tree (2–3 levels). Skip node_modules, .git, __pycache__, venv, dist/build, graphify-out cache
- [ ] 5. If graphify-out/GRAPH_REPORT.md exists, use it for §2 edges; do not re-run a full graph unless the user asked or the report is missing after a large restructure
- [ ] 6. Fill every numbered section; replace bracket examples with facts
- [ ] 7. N/A sections: keep the heading, one line why (e.g. "N/A — this repo has no frontend")
- [ ] 8. No secrets, tokens, private URLs with credentials, env dumps
- [ ] 9. Set §10 Date of Last Update to today
- [ ] 10. If a WISHLIST quickref is now answered, mark that wish fulfilled
```

### Fill rules

- The tree in [template.md](template.md) is a **shape**, not this repo. **Replace it** with the real tree. Never leave `backend/` / `frontend/` examples if those folders do not exist.
- Prefer **pointers** (`docs/operations/FOO.md`) over pasting runbooks.
- Keep §3 to significant components (not every Lambda). Group siblings (“80 telemetry Lambdas — ingest / WhatsApp / fleet / admin / CFG”) and name the entrypoints.
- Collection/table **names only** in §4 — no schema dumps.
- §2: ASCII/C4 context is enough. Optional: link `WEB_PROPERTIES_FLOW.drawio` or `graphify-out/graph.html` if present.
- After the §1 tree, add a short **Ecosystem** bullet list (AGENTS / MISTAKES / WISHLIST / graphify / plans) — not a new numbered section.

### Output location

Always `ARCHITECTURE.md` at the **git repository root** (same layer as `MISTAKES.md` and `WISHLIST.md`). Do not write `docs/ARCHITECTURE.md` as the SoT (a pointer from `docs/architecture/README.md` is OK).

### Stub vs full

If the user only asked to install bindings, a 15-line stub is allowed:

```markdown
# Architecture Overview

**Status:** stub — run skill `repo-architecture` before deep work.

This repo: <one sentence>.
See `AGENTS.md`. Complementary: `MISTAKES.md`, `WISHLIST.md`, `docs/strategy/GRAPHIFY.md`.
```

If the user asked to populate, or you are about to do deep work, write the **full** 11-section file.

## Output template (verbatim heading structure)

Use this exact heading structure and introductory sentences. Replace bracketed examples with this repo’s facts. Do not add sections 12+ unless the user asks. Do not omit sections 1–11.

```markdown
# Architecture Overview
This document serves as a critical, living template designed to equip agents with a rapid and comprehensive understanding of the codebase's architecture, enabling efficient navigation and effective contribution from day one. Update this document as the codebase evolves.

## 1. Project Structure
This section provides a high-level overview of the project's directory and file structure, categorised by architectural layer or major functional area. It is essential for quickly navigating the codebase, locating relevant files, and understanding the overall organization and separation of concerns.


[Project Root]/
├── backend/              # Contains all server-side code and APIs
│   ├── src/              # Main source code for backend services
│   │   ├── api/          # API endpoints and controllers
│   │   ├── client/       # Business logic and service implementations
│   │   ├── models/       # Database models/schemas
│   │   └── utils/        # Backend utility functions
│   ├── config/           # Backend configuration files
│   ├── tests/            # Backend unit and integration tests
│   └── Dockerfile        # Dockerfile for backend deployment
├── frontend/             # Contains all client-side code for user interfaces
│   ├── src/              # Main source code for frontend applications
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Application pages/views
│   │   ├── assets/       # Images, fonts, and other static assets
│   │   ├── services/     # Frontend services for API interaction
│   │   └── store/        # State management (e.g., Redux, Vuex, Context API)
│   ├── public/           # Publicly accessible assets (e.g., index.html)
│   ├── tests/            # Frontend unit and E2E tests
│   └── package.json      # Frontend dependencies and scripts
├── common/               # Shared code, types, and utilities used by both frontend and backend
│   ├── types/            # Shared TypeScript/interface definitions
│   └── utils/            # General utility functions
├── docs/                 # Project documentation (e.g., API docs, setup guides)
├── scripts/              # Automation scripts (e.g., deployment, data seeding)
├── .github/              # GitHub Actions or other CI/CD configurations
├── .gitignore            # Specifies intentionally untracked files to ignore
├── README.md             # Project overview and quick start guide
└── ARCHITECTURE.md       # This document



## 2. High-Level System Diagram
Provide a simple block diagram (e.g., a C4 Model Level 1: System Context diagram, or a basic component diagram) or a clear text-based description of the major components and their interactions. Focus on how data flows, services communicate, and key architectural boundaries.
 
[User] <--> [Frontend Application] <--> [Backend Service 1] <--> [Database 1]
                                    |
                                    +--> [Backend Service 2] <--> [External API]                           

## 3. Core Components
(List and briefly describe the main components of the system. For each, include its primary responsibility and key technologies used.)

### 3.1. Frontend

Name: [e.g., Web App, Mobile App]

Description: Briefly describe its primary purpose, key functionalities, and how users or other systems interact with it. E.g., 'The main user interface for interacting with the system, allowing users to manage their profiles, view data dashboards, and initiate workflows.'

Technologies: [e.g., React, Next.js, Vue.js, Swift/Kotlin, HTML/CSS/JS]

Deployment: [e.g., Vercel, Netlify, S3/CloudFront]

### 3.2. Backend Services

(Repeat for each significant backend service. Add more as needed.)

#### 3.2.1. [Service Name 1]

Name: [e.g., User Management Service, Data Processing API]

Description: [Briefly describe its purpose, e.g., "Handles user authentication and profile management."]

Technologies: [e.g., Node.js (Express), Python (Django/Flask), Java (Spring Boot), Go]

Deployment: [e.g., AWS EC2, Kubernetes, Serverless (Lambda/Cloud Functions)]

#### 3.2.2. [Service Name 2]

Name: [e.g., Analytics Service, Notification Service]

Description: [Briefly describe its purpose.]

Technologies: [e.g., Python, Kafka, Redis]

Deployment: [e.g., AWS ECS, Google Cloud Run]

## 4. Data Stores

(List and describe the databases and other persistent storage solutions used.)

### 4.1. [Data Store Type 1]

Name: [e.g., Primary User Database, Analytics Data Warehouse]

Type: [e.g., PostgreSQL, MongoDB, Redis, S3, Firestore]

Purpose: [Briefly describe what data it stores and why.]

Key Schemas/Collections: [List important tables/collections, e.g., users, products, orders (no need for full schema, just names)]

### 4.2. [Data Store Type 2]

Name: [e.g., Cache, Message Queue]

Type: [e.g., Redis, Kafka, RabbitMQ]

Purpose: [Briefly describe its purpose, e.g., "Used for caching frequently accessed data" or "Inter-service communication."]

## 5. External Integrations / APIs

(List any third-party services or external APIs the system interacts with.)

Service Name 1: [e.g., Stripe, SendGrid, Google Maps API]

Purpose: [Briefly describe its function, e.g., "Payment processing."]

Integration Method: [e.g., REST API, SDK]

## 6. Deployment & Infrastructure

Cloud Provider: [e.g., AWS, GCP, Azure, On-premise]

Key Services Used: [e.g., EC2, Lambda, S3, RDS, Kubernetes, Cloud Functions, App Engine]

CI/CD Pipeline: [e.g., GitHub Actions, GitLab CI, Jenkins, CircleCI]

Monitoring & Logging: [e.g., Prometheus, Grafana, CloudWatch, Stackdriver, ELK Stack]

## 7. Security Considerations

(Highlight any critical security aspects, authentication mechanisms, or data encryption practices.)

Authentication: [e.g., OAuth2, JWT, API Keys]

Authorization: [e.g., RBAC, ACLs]

Data Encryption: [e.g., TLS in transit, AES-256 at rest]

Key Security Tools/Practices: [e.g., WAF, regular security audits]

## 8. Development & Testing Environment

Local Setup Instructions: [Link to CONTRIBUTING.md or brief steps]

Testing Frameworks: [e.g., Jest, Pytest, JUnit]

Code Quality Tools: [e.g., ESLint, Black, SonarQube]

## 9. Future Considerations / Roadmap

(Briefly note any known architectural debts, planned major changes, or significant future features that might impact the architecture.)

[e.g., "Migrate from monolith to microservices."]

[e.g., "Implement event-driven architecture for real-time updates."]

## 10. Project Identification

Project Name: [Insert Project Name]

Repository URL: [Insert Repository URL]

Primary Contact/Team: [Insert Lead Developer/Team Name]

Date of Last Update: [YYYY-MM-DD]

## 11. Glossary / Acronyms

Define any project-specific terms or acronyms.)

[Acronym]: [Full Definition]

[Term]: [Explanation]
```
