# ROADMAP — Backend Engineering University

Curriculum architecture. This is the map, not the territory — lessons get generated module-by-module in Phase 2, after you say `BUILD THE CURRICULUM`.

---

## 1. Current level assessment

Based on your stated background (JS/TS, React, React Native, Next.js, Node.js, REST APIs, SQL/NoSQL, PostgreSQL, NestJS, FastAPI, Docker concepts, cloud/deployment concepts):

**You are not a beginner.** You can already build and ship working APIs. You're roughly at:

- **Level 0–2 (Foundations, Networking, Backend Fundamentals):** mostly *practitioner-level intuition, gaps in the "why."* You've used HTTP, JWTs, REST, pagination — but likely haven't had to reason about TCP handshakes, HTTP/2 multiplexing, or *why* a particular auth scheme fails under specific attack conditions.
- **Level 3 (Databases):** this is almost certainly your **biggest leverage gap**. Most full-stack developers who "know PostgreSQL" know it through an ORM's happy path — they haven't had to reason about isolation levels, MVCC, index selectivity, or what a query planner is actually doing. This curriculum treats Level 3 as the load-bearing module.
- **Level 4 (Data Access):** you've used ORMs but likely haven't compared abstraction costs deliberately (Drizzle vs raw SQL vs JDBC-style access).
- **Level 5–8 (Caching, Messaging, Distributed Systems, Architecture):** likely conceptual awareness (you've heard of Redis, microservices, CQRS) without first-principles grounding or production judgment about *when not to use them*.
- **Level 9 (Infrastructure):** partial — Docker concepts and cloud deployment concepts already present. Gaps likely around Linux internals, reverse proxies, and what a container actually is at the kernel level.
- **Level 10–12 (Reliability, Security, Performance):** typically the weakest area for full-stack-to-backend transitions, because these disciplines are invisible until something breaks in production.
- **Level 13 (System Design):** you can probably describe a system, but "defend it under attack" (the System Design Mode challenge questions) is a different skill — this is a comprehension-only skill until the layers underneath it are solid.

**Working estimate: mid-level backend-capable, senior-level frontend-capable.** The goal of this curriculum is to close the gap asymmetrically — spend disproportionate time on Levels 3, 7, 10, 11, 12 where the gap is largest, and move faster through Levels 0–2 where you already have working intuition (but still validate the fundamentals — intuition built on framework behavior often has silent gaps).

---

## 2. Major knowledge gaps (predicted, will be corrected by diagnostic quizzes in Phase 3)

1. **Database internals** — indexing beyond "add an index," isolation levels beyond "READ COMMITTED is the default," MVCC, lock contention, query planning.
2. **Networking below HTTP** — TCP behavior, connection reuse, what TLS handshake actually costs, HTTP/2 vs HTTP/3 differences.
3. **Failure reasoning** — most full-stack work is written for the happy path. Retries, idempotency, partial failure, backpressure are usually unpracticed.
4. **Distributed systems vocabulary with precision** — CAP is usually known as a slogan, not as a reasoning tool. "Eventual consistency" is usually accepted, not interrogated.
5. **Performance measurement discipline** — likely optimizes on intuition (`this feels slow`) rather than percentile latency data.
6. **Security beyond auth** — SSRF, injection classes beyond SQLi, secrets management, least privilege are commonly underexposed for developers who haven't operated production infra.
7. **Architecture as trade-off analysis** — likely has opinions absorbed from blog posts ("microservices scale better") that need to be interrogated rather than assumed.

These are hypotheses. Diagnostic quizzes at the start of each module will confirm or correct them — don't treat this list as fixed.

---

## 3. Dependency graph

```
LEVEL 0  Engineering Foundations
   │
LEVEL 1  Networking (TCP/UDP, DNS, HTTP/1.1–3, TLS, proxies, load balancers)
   │
LEVEL 2  Backend Fundamentals (REST, auth, sessions/JWT, rate limiting, idempotency, webhooks)
   │
   ├──────────────┐
   ▼              ▼
LEVEL 3        LEVEL 11 (Security — can start early, deepens throughout)
Databases          │
(SQL, indexes,     │
 ACID, isolation,  │
 replication)      │
   │               │
   ▼               │
LEVEL 4            │
Data Access         │
(SQL vs ORM vs      │
 jOOQ vs Drizzle)   │
   │               │
   ▼               │
LEVEL 5            │
Caching             │
   │               │
   ▼               │
LEVEL 6            │
Messaging/Async     │
   │               │
   ▼               │
LEVEL 7  ◄──────────┘
Distributed Systems
(CAP, consensus, replication,
 backpressure, circuit breakers)
   │
   ▼
LEVEL 8
Architecture
(monolith vs microservices,
 DDD, CQRS, event sourcing)
   │
   ├──────────────┐
   ▼              ▼
LEVEL 9        LEVEL 10
Infrastructure  Reliability & Observability
(Linux, Docker,  (logs, metrics, tracing,
 reverse proxy,  SLOs, incident response)
 deployment)         │
   │                 │
   └───────┬─────────┘
           ▼
      LEVEL 12
      Performance Engineering
      (measurement discipline,
       benchmarking, profiling)
           │
           ▼
      LEVEL 13
      Advanced System Design
      (synthesizes everything above)
```

**Reading this graph:** Levels 0–2 are strictly sequential — you cannot reason about API design without networking underneath it. Level 3 (Databases) is the single highest-leverage module and gates almost everything after it. Level 11 (Security) is drawn as a parallel track starting at Level 2, because security concepts (injection, auth, least privilege) apply incrementally to everything you build from that point forward — it isn't a module you do once at the end. Levels 9 and 10 can be interleaved once Level 8 is done. Level 12 (Performance) requires infrastructure + reliability tooling to be meaningful (you can't measure p99 latency without observability). Level 13 is the capstone — it doesn't teach new mechanics, it forces synthesis and defense of everything before it.

---

## 4. The Levels

Each level below lists: prerequisites, what you'll be able to *do* by the end (not just "know"), the topic list, common misconceptions this level specifically targets, and mastery criteria. Full 15-section lessons (per the template in §11) get generated per-topic in Phase 2.

### LEVEL 0 — Engineering Foundations
**Prereqs:** none (you already clear this, but a diagnostic quiz confirms).
**Can-do by end:** Explain how a program actually executes, what a process/thread is, why concurrency is hard, how memory is laid out.
**Topics:** processes vs threads, stack vs heap, synchronous vs asynchronous execution, event loops (tie to Node.js, contrast with thread-per-request in Java), blocking vs non-blocking I/O, Big-O in a backend context (query cost, not just algorithm cost).
**Targets misconception:** "Node.js is single-threaded so it can't do concurrency" (confuses concurrency with parallelism).
**Mastery criteria:** Explain the event loop's phases and predict output ordering of a mixed sync/async/promise/setTimeout snippet without running it.

### LEVEL 1 — Internet & Networking
**Prereqs:** Level 0.
**Can-do by end:** Diagnose "why is this API slow" down to the network layer; explain what changes between HTTP/1.1, HTTP/2, and HTTP/3 and why it matters for a real API.
**Topics:** IP, TCP (handshake, congestion control, head-of-line blocking), UDP, ports/sockets, DNS resolution chain, HTTP semantics, HTTPS/TLS handshake cost, latency vs bandwidth, connection keep-alive, HTTP/1.1 vs HTTP/2 (multiplexing) vs HTTP/3 (QUIC, UDP-based — per Kurose & Ross 9th ed.), forward proxies vs reverse proxies, load balancers (L4 vs L7).
**Targets misconceptions:** "HTTPS is slow" (stale post-TLS-1.3/session-resumption), "load balancers just round-robin."
**Mastery criteria:** Given a network trace/HAR file, identify where latency is being lost (DNS, TCP handshake, TLS, TTFB, transfer) and propose a fix per layer.

### LEVEL 2 — Backend Fundamentals
**Prereqs:** Level 1.
**Can-do by end:** Design a REST API that handles auth, pagination, errors, retries, and duplicate requests correctly — and explain *why* each decision was made, not just implement it from memory.
**Topics:** REST constraints (and where real APIs violate them on purpose), API design (versioning, error contracts), serialization, validation, authentication vs authorization, sessions, JWT (and its actual failure modes — revocation, size, algorithm confusion), cookies (SameSite, HttpOnly), rate limiting (token bucket, sliding window), pagination (offset vs cursor — ties directly into Level 3 indexing), idempotency (ties into Level 6/7), webhooks, file uploads, background jobs.
**Targets misconceptions:** "JWTs are stateless so they're always simpler than sessions," "REST means CRUD over HTTP."
**Mastery criteria:** Design an idempotent payment-creation endpoint and defend it against duplicate submission, network retry, and concurrent request scenarios.

### LEVEL 3 — Databases (highest-leverage module — go deep)
**Prereqs:** Level 2.
**Can-do by end:** Read a query plan and know what to fix; choose an isolation level with a reason; explain what happens under concurrent writes without guessing.
**Topics:** relational modeling, normalization/denormalization trade-offs, SQL (joins, subqueries, window functions), indexes and B-trees (what the index actually stores, why it can make a query *slower*), query planning/EXPLAIN ANALYZE, transactions, ACID broken down individually, isolation levels (Read Committed, Repeatable Read, Serializable — and Postgres's actual defaults/quirks), locking (row vs table, optimistic vs pessimistic), MVCC (how Postgres implements it, vacuum), deadlocks, constraints, migrations, connection pooling, replication (sync vs async, replication lag), backups/recovery, partitioning, sharding.
**Targets misconceptions:** "Indexes always make queries faster," "the ORM handles transactions correctly by default," "READ COMMITTED prevents race conditions."
**Mastery criteria:** Given a slow query and its EXPLAIN ANALYZE output, diagnose the bottleneck and propose an index or query rewrite — and explain a scenario where adding an index would make writes unacceptably slow.

### LEVEL 4 — Data Access
**Prereqs:** Level 3.
**Can-do by end:** Choose a data-access strategy for a given team/project deliberately, articulating the abstraction cost being paid.
**Topics:** raw SQL, JDBC, Spring Data JDBC, JPA/Hibernate (N+1, lazy loading, the identity map), jOOQ (type-safe SQL, code generation), Drizzle (SQL-close TS query builder), query builders generally. Comparison axes: abstraction level, performance overhead, SQL control, debuggability, migration story.
**Targets misconceptions:** "ORMs are just slower" (sometimes true, often not the real cost — the real cost is *hidden* queries), "type safety means correctness."
**Mastery criteria:** Given the same feature requirement, implement it in raw SQL and in Drizzle, and articulate precisely what the abstraction bought and cost.

### LEVEL 5 — Caching
**Prereqs:** Level 3–4.
**Can-do by end:** Decide what to cache, where, for how long, and how to invalidate it — before reaching for Redis.
**Topics:** why caching works (locality, latency, cost of recomputation), cache hit/miss economics, TTL design, invalidation strategies, cache-aside, write-through, write-back, cache stampede (thundering herd) and mitigations, stale-data trade-offs, Redis (data structures, persistence modes, eviction), distributed caching, cache coherence across instances.
**Targets misconceptions:** "Redis is fast because it's in-memory" (it's also fast because of its single-threaded execution model avoiding lock contention, and *slow* if you misuse data structures or block on `KEYS`).
**Mastery criteria:** Design a cache-aside layer for a read-heavy endpoint and explain the exact race condition that causes stale reads under concurrent invalidation — and how to close it.

### LEVEL 6 — Asynchronous Processing
**Prereqs:** Level 2, Level 3.
**Can-do by end:** Build a correct producer/consumer pipeline that survives worker crashes and duplicate delivery.
**Topics:** queues, producers/consumers, retries, exponential backoff + jitter, dead-letter queues, delivery semantics (at-most-once, at-least-once, "exactly-once" — and why that claim is usually marketing), idempotent consumers, RabbitMQ (routing, acknowledgments), Kafka concepts (partitions, offsets, consumer groups — conceptual, not necessarily hands-on ops).
**Targets misconceptions:** "Exactly-once delivery is guaranteed," "async is always faster" (it changes *where* latency is paid, not whether it exists).
**Mastery criteria:** Design a webhook-retry system that is safe to replay indefinitely without double-processing.

### LEVEL 7 — Distributed Systems (second highest-leverage module)
**Prereqs:** Levels 3, 5, 6.
**Can-do by end:** Reason precisely about what breaks when a node dies, a network partitions, or two replicas disagree — with vocabulary, not vibes.
**Topics:** horizontal scaling, replication strategies, partitioning, consistency models, availability, CAP (and why it's a much narrower theorem than it's usually taught as — and PACELC as the more useful successor), consensus (Raft/Paxos at a conceptual level), leader election, distributed locks (and why they're harder than they look — fencing tokens), distributed transactions (2PC, sagas), eventual consistency, logical clocks/ordering, failure detection, backpressure, retries with budgets, timeouts, circuit breakers.
**Targets misconceptions:** "More replicas means more consistency" (usually the opposite trade-off), "a distributed lock is just a mutex over the network."
**Mastery criteria:** Given a system design with a described failure (partition, crashed leader, duplicate message), predict the actual system behavior and identify which invariant breaks.

### LEVEL 8 — Architecture
**Prereqs:** Level 7.
**Can-do by end:** Defend an architecture choice as a trade-off, not a trend — including choosing a boring monolith when that's correct.
**Topics:** monoliths, modular monoliths, microservices (and their *actual* costs: distributed debugging, data consistency, deployment coordination), service boundaries, event-driven architecture, CQRS, event sourcing, hexagonal/clean architecture, domain-driven design (bounded contexts, aggregates), API gateways.
**Targets misconceptions:** "Microservices scale better" (they scale teams, not necessarily systems — and add distributed-systems tax from Level 7 to every feature).
**Mastery criteria:** Given a product brief, propose an architecture and defend it under three counter-scenarios (10x traffic, a new compliance requirement, a team split).

### LEVEL 9 — Infrastructure
**Prereqs:** Level 2 (parallel-track after that).
**Can-do by end:** Understand what's actually happening between `git push` and a request being served — not just which buttons to click.
**Topics:** Linux fundamentals (processes, memory, filesystems, permissions), containers and what Docker actually virtualizes (namespaces, cgroups — not "a lightweight VM"), reverse proxies (Nginx), TLS certificate lifecycle, deployment strategies (blue-green, canary, rolling), CI/CD pipeline design, cloud fundamentals (VMs vs containers vs serverless — cost and cold-start trade-offs), Kubernetes concepts (only the mental model: pods, services, deployments, not full ops depth unless it becomes load-bearing).
**Targets misconceptions:** "A container is a lightweight VM," "serverless has no cold-start cost."
**Mastery criteria:** Explain, layer by layer, what happens from `docker run` to a process listening on a port being reachable from outside the host.

### LEVEL 10 — Reliability & Observability
**Prereqs:** Level 9 (parallel with it is fine).
**Can-do by end:** Instrument a system so that when it breaks, you find out from a dashboard, not a user complaint — and design for graceful degradation, not just uptime.
**Topics:** logs (structured logging), metrics, distributed tracing, health checks (liveness vs readiness), SLIs/SLOs/SLAs and error budgets, alerting design (avoiding alert fatigue), graceful degradation, fault tolerance patterns, disaster recovery planning, backup strategy, incident response (postmortems, blameless culture), capacity planning.
**Targets misconceptions:** "100% uptime is the goal" (it's an availability/cost trade-off expressed as an error budget).
**Mastery criteria:** Given a production incident scenario, write the sequence of dashboard checks you'd make, in order, and what each result would rule in/out.

### LEVEL 11 — Security
**Prereqs:** starts alongside Level 2, deepens continuously.
**Can-do by end:** Threat-model a feature before building it, not patch it after a report.
**Topics:** OWASP Top 10 in detail, SQL injection (and why parameterization is necessary but not sufficient), XSS, CSRF, SSRF (especially relevant for anything that fetches user-supplied URLs — common in fintech/marketplace webhooks), secrets management, encryption at rest/in transit, hashing (password storage — bcrypt/argon2, why fast hashes are wrong here), API security (key rotation, scopes), rate limiting as a security control (not just a performance one), threat modeling (STRIDE at a light level), least privilege.
**Targets misconceptions:** "Parameterized queries alone prevent all injection," "hashing and encryption are interchangeable."
**Mastery criteria:** Threat-model a login + password-reset flow and identify at least 3 non-obvious attack vectors before implementation.

### LEVEL 12 — Performance Engineering
**Prereqs:** Levels 9, 10.
**Can-do by end:** Optimize based on a measured bottleneck, never intuition — and know when *not* to optimize.
**Topics:** latency vs throughput, concurrency models, profiling, benchmarking methodology, database optimization (revisits Level 3 with a performance lens), caching strategy validation, connection pooling tuning, CPU/memory/I/O-bound diagnosis, load testing, bottleneck analysis, percentile latency (p50/p95/p99) and why averages lie.
**Targets misconceptions:** "This feels slow so I'll add caching/an index/async" without a measurement — the curriculum explicitly refuses to accept an optimization without a stated baseline and bottleneck theory.
**Mastery criteria:** Given a load-test result with a latency distribution, identify the bottleneck class (CPU, I/O, lock contention, N+1 query, GC pause) and justify the diagnosis from the data, not a guess.

### LEVEL 13 — Advanced System Design (capstone)
**Prereqs:** everything above.
**Can-do by end:** Design and defend a real system (payments, notifications, marketplace, etc.) under adversarial questioning, using vocabulary and trade-off reasoning from every prior level.
**Topics:** applied synthesis across payment platforms, notification platforms, URL shorteners, messaging systems, file storage, marketplaces, SaaS multi-tenancy, analytics pipelines, news feeds, auth platforms, ride-sharing-style dispatch, healthcare data platforms.
**Mode:** this level is run almost entirely in System Design Mode (see README) — you propose, I attack, you defend or revise.
**Mastery criteria:** Design a system end-to-end on a blank page, survive the standard attack question set (10x traffic, DB down, duplicate request, message delivered twice, worker crash, external API timeout, network partition, data inconsistency) without hand-waving.

---

## 5. Learning order

Strict sequence: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**.
Parallel track starting after Level 2: **Level 11 (Security)** — a short security lesson accompanies each subsequent module (e.g., SQL injection lands right after Level 3's SQL lessons, not as a separate unit six months later).
After Level 8: **9 and 10 interleave** (infrastructure and observability are naturally learned together — you instrument what you deploy).
**12 (Performance)** requires 9+10 to be meaningful (you need infra + observability tooling to measure anything real).
**13 (System Design)** is continuous from Level 8 onward in *light* form (short design challenges after each module) and becomes the dominant mode once Level 12 is done.

Given your existing practitioner-level familiarity with 0–2, expect to move through those faster (diagnostic-quiz-gated — if you pass the diagnostic, we skip straight to gaps) and spend the most calendar time in 3, 7, 10, 11, 12.

---

## 6. Projects

Projects are checkpoints, not busywork — each requires concepts from multiple completed levels and is reviewed in Code Review Mode / System Design Mode, not handed a template.

| # | Project | Unlocks after | Forces you to apply |
|---|---|---|---|
| 1 | **Production REST API** — auth, PostgreSQL, validation, pagination, filtering, error handling, tests, logging, Docker, deployment | Level 4 | 1–4, intro of 9, 11 |
| 2 | **Payment System (simulated)** — payment intents, idempotency, transactional state machine, webhooks, retries, reconciliation, audit logs, failure recovery | Level 6 | 2, 3, 6, 11 — this is the fintech-relevant project given your stated interest |
| 3 | **Notification Platform** — API → queue → workers → email/SMS/push, retries, backoff, DLQ, rate limiting, scheduling, delivery tracking, idempotency | Level 6 | 5, 6 |
| 4 | **Multi-Tenant SaaS** — orgs, users, roles, permissions, subscriptions, usage metering, API keys, audit logs, billing concepts | Level 8 | 3, 4, 8, 11 |
| 5 | **Distributed System** — multiple services, messaging, caching, replication, failure handling, observability | Level 10 | 5, 6, 7, 9, 10 |
| **Final** | **African-market SaaS/fintech platform, your design** — I review and attack, I do not design it for you | Level 13 | everything |

Note: given your stated interest in fintech/payments for African markets, Project 2 and the Final Project are the ones worth the most deliberate time. Project 2 in particular should not be rushed — payment state machines are exactly where "works in the demo" and "works in production" diverge hardest.

---

## 7. Books and resources

Kept deliberately short — these support implementation, they don't replace it. Introduced when the module they support begins, not all at once.

| Book | Use it for | When | Prerequisite to get value from it |
|---|---|---|---|
| **Computer Networking: A Top-Down Approach** — Kurose & Ross, **9th ed. (2025, copyright 2026)** | Level 1. This edition adds HTTP/3/QUIC and current wireless material — relevant since you'll hit HTTP/3 in modern API gateways/CDNs. | Alongside Level 1 | None — it's written to be a first networking text |
| **Designing Data-Intensive Applications** — Kleppmann, **now in a 2nd edition (Kleppmann & Riccomini, O'Reilly, March 2026)** | Levels 3, 5, 6, 7 — this is the single most load-bearing book in the whole curriculum. Read it in *pieces* aligned to those levels, not cover-to-cover up front. | Ch. 1–3, 7 with Level 3; Ch. 5–6, 11 with Level 6–7; Ch. 8–9 with Level 7 | Level 3 fundamentals — the book assumes you already know what a transaction and an index are, and builds past that |
| **Database Internals** — Alex Petrov | Level 3 deep-dive (Part I: storage engines, B-trees, log-structured storage) and Level 7 (Part II: replication, consensus, distributed transactions — direct overlap/reinforcement of DDIA) | After the core Level 3 module, as a "go deeper" text, not a first pass | Comfortable with SQL and basic transaction concepts first — this is not an intro book |
| **Fundamentals of Software Architecture** — Richards & Ford, **2nd ed.** (5 new chapters incl. architectural characteristics, data, team topologies) | Level 8 | With Level 8 | Levels 3–7, otherwise the trade-off discussions have no grounding |
| **System Design Interview, Vol. 1 & 2** — Alex Xu & Sahn Lam | Level 13 — useful as a *framework* (clarify → high-level design → deep dive → bottlenecks) and worked examples, but treat it as a companion to the attack-question method in this curriculum, not a substitute — the book alone stays at "recognition" level mastery, not "design under adversarial questioning" | Level 13 only | Levels 1–12; reading it earlier produces pattern-matching without understanding, which is exactly what this curriculum is trying to avoid |

No other books are assigned by default. If a genuine gap shows up during a module (e.g., you want deeper Kafka internals, or deeper Postgres internals than Petrov covers), I'll recommend something specific at that point rather than front-loading a reading list.

---

## 8. Mastery system

A topic is not "done" because a lesson was read. Tracked per-topic in `PROGRESS.md` on this scale:

1. **Recognition** — you know the term.
2. **Explanation** — you can explain it in your own words.
3. **Application** — you can use it in code.
4. **Debugging** — you can spot it being used wrong.
5. **Reasoning** — you can explain trade-offs and failure modes. **← minimum bar for "mastered"**
6. **Design** — you can apply it inside a real system design.
7. **Teaching** — you can explain it clearly to another engineer (tested via `Teach` mode).

Only Level 5+ counts as mastered in `PROGRESS.md`. Levels 1–4 are "in progress."

---

## 9. Weekly study structure (proposed default — adjustable)

Assuming part-time study alongside other work (adjust freely, this is a default, not a mandate):

- **5 sessions/week, ~60–90 min each.**
- **3 sessions:** new material (`Start`) — Learn → Recall → Practice for the topic.
- **1 session:** `Review` — spaced-repetition pass over previously-struggled concepts (tracked in `PROGRESS.md`'s misconception log) + one `Debug` exercise.
- **1 session:** `Design` or project work — applying the week's concepts to whichever project is currently unlocked.
- **End of each module:** `Exam` — full-module mastery test before moving on. A module is not "complete" in `PROGRESS.md` until its exam is passed at mastery level 5+ on every topic.

Rough pacing given your starting level: Levels 0–2 (~2–3 weeks combined, faster due to existing familiarity but not skipped), Level 3 (~4–6 weeks — this is the deep module), Levels 4–6 (~2 weeks each), Level 7 (~4 weeks — second-deepest module), Level 8 (~2 weeks), Levels 9–10 (~3 weeks combined), Level 11 (ongoing, ~1 week concentrated + continuous reinforcement), Level 12 (~2 weeks), Level 13 (ongoing capstone, several weeks of design sessions). This is a rough guide, not a deadline — pace is set by mastery-5, not by calendar.

---

## 10. Anti-procrastination policy

You have a stated tendency to get interested in adjacent technologies mid-curriculum. Standing rule: if you ask about adopting a new technology (Go, Rust, Kafka in production, Bun, Kubernetes, etc.) that isn't load-bearing for your **current** module, the default answer is **"not yet"** with a one-line reason, not a feature comparison. Exceptions only when the technology is genuinely necessary for the concept currently being taught (e.g., Redis when we reach Level 5 is not a detour, it's the lesson). This rule applies to me (the tutor) as much as to your questions — I will not introduce a new technology ahead of the module that motivates it.

---

## 11. Lesson template (used for every lesson generated in Phase 2)

Every lesson file will contain, in order: **1)** Why does this exist (real-world problem), **2)** Mental model, **3)** Simple explanation, **4)** Technical explanation, **5)** How it works internally, **6)** Example, **7)** Code (TS/NestJS, PostgreSQL, or Java/Spring depending on topic), **8)** Failure scenarios, **9)** Common misconceptions, **10)** Trade-offs, **11)** Real-world applications, **12)** Connections to prior lessons, **13)** Practical exercise (no solution given), **14)** Challenge (harder scenario), **15)** Mastery test.

---

## What's next

Say **`BUILD THE CURRICULUM`** to start generating Module 1 (`01-networking/`) lesson-by-lesson. I will not generate hundreds of lessons at once — one module at a time, with exercises and a module exam before moving on.

Or, if anything above should change first — level ordering, project choices, book list, pacing — say so now. This roadmap is the thing to argue with before content gets built on top of it.
