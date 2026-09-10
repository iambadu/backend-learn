# System Design Scenario Bank

Twelve prompts, matching `ROADMAP.md`'s Level 13 topic list. Each gives the scenario and the specific tension it's built to surface — deliberately no solutions or reference architectures here; working through one means invoking `System design` mode and running Lesson 1's four-step method against it, out loud, with the tutor attacking your design as you go. The "curriculum leverage" line names which modules the scenario draws hardest on, so you know where to expect the deepest questioning.

---

**1. Payment platform (directly relevant to Project 2 and your stated fintech interest)**
Design a system that processes payments between users and merchants, with support for refunds and partial failures. The core tension: correctness under concurrency and failure (a payment must never be lost or duplicated) versus latency (users expect a fast response).
*Curriculum leverage: Module 3 (transactions/isolation), Module 2 Lesson 8 (idempotency), Module 7 Lesson 6 (sagas vs. 2PC), Module 11 (secrets/least-privilege for provider credentials).*

**2. Notification platform (directly relevant to Project 3)**
Design a system delivering notifications via email, SMS, and push, at high volume, with delivery tracking and user preferences. The core tension: at-least-once delivery guarantees versus not spamming a user with duplicates when a retry occurs.
*Curriculum leverage: Module 6 (queues, delivery semantics, DLQ), Module 5 (caching preferences/unread counts).*

**3. URL shortener**
Design a service that takes a long URL and returns a short one, redirecting on access, at web scale. The core tension: a deceptively simple write path versus a read path that must be extremely fast and handle massive skew (some links get far more traffic than others).
*Curriculum leverage: Module 3 Lesson 10 (sharding a keyspace), Module 5 (caching hot links), Module 1 Lesson 8 (edge/CDN placement for redirects).*

**4. Messaging/chat system**
Design a real-time one-to-one and group messaging system. The core tension: message ordering and delivery guarantees (Module 7 Lesson 7's causality content is directly relevant to group chat ordering) versus the cost of maintaining real-time, persistent connections at scale.
*Curriculum leverage: Module 7 Lessons 2 and 7 (consistency/ordering), Module 6 (delivery semantics), Module 9 (connection-heavy infrastructure, not the typical stateless-request assumption).*

**5. File storage system**
Design a service like a simplified cloud drive — upload, download, share files, with versioning. The core tension: large binary payloads (Module 2 Lesson 9's streaming-upload content) versus metadata operations that need to be fast and consistent (Module 3's relational content for the metadata layer, distinct from the blob storage itself).
*Curriculum leverage: Module 2 Lesson 9 (streaming/backpressure), Module 3 Lesson 10 (partitioning metadata at scale), Module 2 Lesson 3 (ReBAC for sharing/permissions).*

**6. Marketplace (two-sided: buyers and sellers)**
Design a marketplace connecting buyers and sellers, with listings, search, and transactions. The core tension: search/discovery (a read-heavy, denormalized, eventually-consistent concern) versus transactional integrity when a purchase actually happens (a strongly-consistent concern) — the same system genuinely needing two different consistency postures for two different parts of itself.
*Curriculum leverage: Module 7 Lesson 2 (consistency models, applied per-subsystem, not uniformly), Module 8 Lesson 3 (CQRS is a strong candidate here), Module 3 Lesson 1 (denormalized search read models).*

**7. Multi-tenant SaaS platform (directly relevant to Project 4)**
Design the core of a B2B SaaS product: organizations, users, roles, and permissions, with data isolation between tenants. The core tension: genuine tenant isolation (a security and correctness requirement — Module 11) versus the operational cost of true per-tenant infrastructure isolation at scale.
*Curriculum leverage: Module 8 Lesson 2 (bounded contexts per tenant concept), Module 2 Lesson 3 (RBAC/ReBAC hybrid), Module 3 Lesson 10 (sharding strategies for tenant data), Module 11 (least privilege between tenants).*

**8. Analytics/event-tracking system**
Design a system ingesting high-volume event data (page views, clicks) and serving aggregated dashboards. The core tension: ingest volume (write-optimized, append-only, Module 6's queue/streaming content) versus query flexibility for arbitrary dashboard aggregations (Module 3 Lesson 2's window functions, Module 8 Lesson 3's CQRS read models).
*Curriculum leverage: Module 6 Lesson 5 (Kafka's log model fits this shape specifically), Module 3 Lesson 10 (time-based partitioning), Module 8 Lesson 3 (event sourcing/CQRS).*

**9. News feed / social timeline**
Design a system generating a personalized feed of posts from people a user follows. The core tension: fan-out-on-write (precompute every follower's feed when a post is made — fast reads, expensive/skewed writes for a popular account) versus fan-out-on-read (compute the feed at request time — cheap writes, expensive reads) — a real, named, classic trade-off worth explicitly deriving rather than guessing at.
*Curriculum leverage: Module 5 (caching precomputed feeds), Module 3 Lesson 10 (sharding by user), Module 7 Lesson 2 (eventual consistency — a feed that's a few seconds stale is normal and acceptable).*

**10. Authentication/identity platform**
Design a centralized auth service other applications delegate login to (an internal identity provider). The core tension: Module 2 Lessons 3–5's entire authN/authZ/session/JWT content, now as the *product itself* rather than a feature embedded in a larger app — every failure mode from that module (token revocation, algorithm confusion, session vs. JWT trade-offs) is now the core design problem, not a side concern.
*Curriculum leverage: Module 2 Lessons 3, 4, 5 in full; Module 11 (this system is the highest-value target in any architecture that depends on it — threat-model it accordingly).*

**11. Ride-sharing / dispatch system**
Design a system matching riders to nearby drivers in real time. The core tension: genuinely real-time, location-based matching (a workload this curriculum hasn't given a dedicated data structure for — worth reasoning from first principles about what indexing a moving, 2D-located dataset requires) versus the same correctness concerns (a ride must not be double-booked — Module 3 Lesson 6's locking content) as any other transactional system.
*Curriculum leverage: Module 3 Lesson 6 (locking/isolation for the match-and-book operation), Module 7 (real-time state synchronization between rider/driver clients), Module 9 (connection-heavy, location-streaming infrastructure).*

**12. Healthcare records platform**
Design a system storing and sharing patient records between providers, with strict access control and audit requirements. The core tension: Module 11 Lesson 5's STRIDE repudiation category is unusually central here (every access must be provably attributable) alongside Module 2 Lesson 3's authorization content at its most demanding (a doctor should see only the patients they're actually treating, not a blanket "all patients" role) and Module 3 Lesson 10's backup/RPO content at its strictest (records data loss is not an acceptable trade for latency, ever).
*Curriculum leverage: Module 11 Lesson 5 (STRIDE, especially repudiation and information disclosure), Module 2 Lesson 3 (fine-grained ABAC), Module 3 Lesson 10 (RPO/RTO with near-zero tolerance).*

---

## Using this bank

Pick one, say `System design`, and work it with Lesson 1's four-step method. Don't pick in order — pick whichever scenario's "core tension" line currently feels least comfortable; that's the one worth practicing. Each scenario can be revisited multiple times as your mastery of the underlying modules deepens — a design you produce after finishing Module 7 will look meaningfully different from one you produce before it, and that difference is itself a useful signal for `PROGRESS.md`'s spaced-review tracking.
