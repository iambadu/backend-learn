# PROGRESS

Live mastery tracker. Updated as modules are built and worked through — not touched during Phase 1.

**Mastery scale:** 1 Recognition · 2 Explanation · 3 Application · 4 Debugging · 5 Reasoning · 6 Design · 7 Teaching
Mastered = **5+**. Anything below is "in progress."

Last updated: 2026-09-10

---

## Status

| Phase | Status |
|---|---|
| Phase 1 — Curriculum architecture | ✅ Complete (`ROADMAP.md`) |
| Phase 2 — Lesson generation | ✅ Complete — all 13 modules built (2026-09-10/11), 0 lessons worked through yet |
| Phase 3 — Interactive tutor | ⬜ Not started — begins the moment you say `Start`, `Quiz me`, or pick a module to work |

---

## Module progress

| Level | Module | Status | Mastery (avg) | Exam passed |
|---|---|---|---|---|
| 0 | Engineering Foundations | Diagnostic only (`01-networking/00-diagnostic.md`) — no dedicated module | — | — |
| 1 | Networking | **Lessons built, not yet worked through** | — | Exam ready (`exams/01-networking-exam.md`) |
| 2 | Backend Fundamentals | **Lessons built, not yet worked through** | — | Exam ready (`exams/02-backend-fundamentals-exam.md`) |
| 3 | Databases | **Lessons built, not yet worked through** | — | Exam ready (`exams/03-databases-exam.md`) |
| 4 | Data Access | **Lessons built, not yet worked through** | — | Exam ready (`exams/04-data-access-exam.md`) |
| 5 | Caching | **Lessons built, not yet worked through** | — | Exam ready (`exams/05-caching-exam.md`) |
| 6 | Messaging / Async | **Lessons built, not yet worked through** | — | Exam ready (`exams/06-messaging-exam.md`) |
| 7 | Distributed Systems | **Lessons built, not yet worked through** | — | Exam ready (`exams/07-distributed-systems-exam.md`) |
| 8 | Architecture | **Lessons built, not yet worked through** | — | Exam ready (`exams/08-architecture-exam.md`) |
| 9 | Infrastructure | **Lessons built, not yet worked through** | — | Exam ready (`exams/09-infrastructure-exam.md`) |
| 10 | Reliability & Observability | **Lessons built, not yet worked through** | — | Exam ready (`exams/10-reliability-exam.md`) |
| 11 | Security | **Lessons built, not yet worked through** | — | Exam ready (`exams/11-security-exam.md`) |
| 12 | Performance Engineering | **Lessons built, not yet worked through** | — | Exam ready (`exams/12-performance-exam.md`) |
| 13 | Advanced System Design | **Framework + scenario bank built** — mode-driven, not lesson-driven | — | Capstone rubric ready (`exams/13-system-design-exam.md`) |

---

## Per-topic mastery log

Populated as each topic's lessons are worked through. Format: `topic — level (N) — date — note`.

**Module 1 — Networking (9 lessons + diagnostic, generated 2026-09-10, not yet worked through):**
- `00` Diagnostic — Level 0 foundations check
- `01` IP & packets
- `02` TCP — handshake, reliability, congestion control (CUBIC/BBR), ports & sockets
- `03` UDP vs TCP
- `04` DNS — resolution chain
- `05` HTTP semantics — methods, status codes, statelessness
- `06` TLS & HTTPS — handshake, key schedule, forward secrecy
- `07` HTTP/1.1 vs HTTP/2 vs HTTP/3 — HPACK, multiplexing, QUIC
- `08` Proxies & load balancers — L4/L7, consistent hashing, Maglev, health checks
- `09` Latency, bandwidth & connection management — delay components, BDP, connection reuse

No mastery levels logged yet — nothing has been attempted (Start/Quiz me/Practice/Exam) against these lessons.

**Module 2 — Backend Fundamentals (9 lessons, generated 2026-09-10, not yet worked through):**
- `01` REST & API design — Fielding's constraints, Richardson Maturity Model, versioning, RFC 9457 error contracts
- `02` Serialization & validation — Zod vs class-validator, JSON vs protobuf, content negotiation
- `03` Authentication vs authorization — OAuth 2.0/PKCE, OIDC, RBAC/ABAC/ReBAC, IDOR
- `04` Sessions & cookies — HttpOnly/Secure/SameSite, Redis-backed sessions, revocation
- `05` JWT — key schedule/structure, RFC 8725 (none-alg, alg-confusion attacks), revocation problem
- `06` Rate limiting — token/leaky bucket, sliding window log/counter, GCRA, distributed race conditions
- `07` Pagination — offset O(n) cliff, keyset/cursor pagination, index seek vs scan
- `08` Idempotency — idempotency keys, Stripe's pattern, atomicity via unique constraints
- `09` Webhooks, uploads & background jobs — HMAC + replay protection, streaming uploads/backpressure, transactional outbox

No mastery levels logged yet.

**Modules 3–13 (built 2026-09-10/11, not yet worked through) — condensed index, see each module's directory and its `exams/0N-*.md` for full lesson/topic lists:**
- Module 3 — Databases (10 lessons): normalization, joins/window functions, indexes/B-trees, query planning, transactions/ACID, isolation/locking, MVCC/vacuum, constraints/migrations, connection pooling/replication, partitioning/sharding/backups.
- Module 4 — Data Access (5 lessons): JDBC, ORM/Hibernate N+1, jOOQ/Spring Data JDBC, Drizzle, choosing a strategy.
- Module 5 — Caching (5 lessons): fundamentals, cache-aside/write-through/write-back, invalidation/stampede, Redis internals, distributed caching.
- Module 6 — Messaging/Async (5 lessons): queues/producers/consumers, retries/backoff/DLQ, delivery semantics/idempotent consumers, RabbitMQ, Kafka.
- Module 7 — Distributed Systems (8 lessons): CAP/PACELC, consistency models, consensus (Raft), failure detection, distributed locks, 2PC/sagas, logical clocks, backpressure/circuit breakers.
- Module 8 — Architecture (5 lessons): monolith vs. microservices, DDD/bounded contexts, event-driven/CQRS/event sourcing, hexagonal/clean architecture, API gateways/BFF.
- Module 9 — Infrastructure (5 lessons): Linux fundamentals, containers/Docker internals, deployment strategies/CI-CD, cloud fundamentals, Kubernetes concepts.
- Module 10 — Reliability & Observability (4 lessons): logs/metrics/tracing, health checks/SLOs, alerting/incident response, disaster recovery/capacity planning.
- Module 11 — Security (5 lessons): OWASP/injection, XSS/CSRF/SSRF, secrets/encryption/hashing, API security/least privilege, threat modeling (STRIDE).
- Module 12 — Performance Engineering (4 lessons): latency/percentiles, profiling (CPU/I/O/memory), database/caching tuning, load testing/benchmarking.
- Module 13 — Advanced System Design (framework + 12-scenario bank, mode-driven — see `01-system-design-framework.md` and `02-scenario-bank.md`).

No mastery levels logged for any of the above yet.

---

## Diagnostic quiz results

Before Levels 0–2 begin, a short diagnostic quiz checks which of your existing frontend/full-stack intuitions already clear mastery-5, so we don't re-teach what you already have. Results logged here once run.

_(not yet run)_

---

## Misconception log

Tracks specific wrong mental models caught during Quiz/Debug/Exam modes, so spaced review can target them precisely instead of re-reading a whole lesson.

| Date | Misconception caught | Correct model | Re-tested | Result |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Spaced review queue

Concepts due for re-testing, with increasing intervals. Populated automatically as topics are marked mastered.

_(empty)_

---

## Projects

| # | Project | Status | Notes |
|---|---|---|---|
| 1 | Production REST API | Not started | Unlocks after Level 4 |
| 2 | Payment System (simulated) | Not started | Unlocks after Level 6 — priority given fintech interest |
| 3 | Notification Platform | Not started | Unlocks after Level 6 |
| 4 | Multi-Tenant SaaS | Not started | Unlocks after Level 8 |
| 5 | Distributed System | Not started | Unlocks after Level 10 |
| Final | African-market SaaS/fintech (self-designed) | Not started | Unlocks after Level 13 |

---

## Notes

- Update this file after every `Exam` and after every `Review` session.
- A module only flips to "Complete" once every topic in it is at mastery 5+ **and** the module exam is passed.
- If a topic is failed twice in `Review`, log the suspected prerequisite gap here, not just the symptom.
