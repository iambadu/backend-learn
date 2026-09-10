# Module Exam — 05: Caching

Cumulative test across Lessons 1–5. No answer key here — worked through in conversation (`Exam` mode).

---

## Section A — Recall & mechanism

1. State the hit-rate/cost-ratio reasoning that determines whether caching a given access pattern is worthwhile.
2. Distinguish cache-aside, write-through, and write-back by what each guarantees and what each risks.
3. Name four cache-stampede mitigation techniques and the specific mechanism each uses.
4. Give the complete answer to "why is Redis fast" — every contributing factor, not just "in-memory."
5. Explain Redis Cluster's hash-slot mechanism and what hash tags solve.

## Section B — Explain in your own words

6. Explain why a cache is a form of denormalization, connecting to Module 3, Lesson 1.
7. Explain why `KEYS *` is dangerous in production Redis, mechanically, not just "it's slow."
8. Explain why Pub/Sub-based cache invalidation needs a TTL backstop.
9. Explain the specific scenario where Redis Cluster can lose an acknowledged write during failover.

## Section C — Scenario diagnosis

10. A popular product page's cache expires and your database briefly spikes to 50x normal load every time it does, roughly every 5 minutes. Diagnose and propose a fix, citing the specific mechanism.
11. Users report being randomly logged out under high traffic. Your Redis instance holds both response-cache data and session data with an `allkeys-lru` policy. Diagnose.
12. A multi-key Redis transaction that worked in development starts failing with `CROSSSLOT` errors after moving to a Redis Cluster in production. Diagnose and fix.

## Section D — Trade-off reasoning

13. Argue for or against caching Project 2's account balance at all, and if so, which strategy from Lesson 2 would make it safe (or argue none does and why).
14. Defend a specific eviction policy choice for a Redis instance serving three different roles (cache, sessions, rate limiting) in one system.
15. Argue for or against sharding to Redis Cluster for a described workload (given in conversation), using Lesson 5's real costs, not just its scaling benefits.

## Section E — System design

16. Design the full caching architecture for Project 3 (Notification Platform): what's cached, which strategy per data type, stampede protection where needed, and single-instance vs. clustered Redis, justified against this module's content throughout.

---

**On passing:** update `PROGRESS.md` — Module 5 complete, log mastery levels. Module 6 (Asynchronous Processing / Messaging) unlocks next.
