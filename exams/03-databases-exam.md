# Module Exam — 03: Databases

The highest-leverage module in the curriculum per `ROADMAP.md`. Cumulative test across Lessons 1–10. No answer key here — worked through in conversation (`Exam` mode). Passing means mastery level 5+ on every section; given this module's weight, don't advance to Module 4 on a shaky pass.

---

## Section A — Recall & mechanism

1. Define 1NF, 2NF, and 3NF precisely, and state the specific anomaly each fixes relative to the previous form.
2. Explain what a covering index and an index-only scan eliminate, and the one condition that can undermine the benefit even when both are set up correctly.
3. Name the three join algorithms Postgres's planner chooses between and the condition favoring each.
4. State all four ACID guarantees precisely — not as an acronym, as mechanisms.
5. Name Postgres's three effectively distinct isolation levels and one specific anomaly each one permits that the next-strongest level forbids.
6. Explain what a dead tuple is, why it exists, and what VACUUM does about it.
7. State the pool-sizing formula's reasoning (not just the formula) for connection pooling.
8. Distinguish asynchronous and synchronous replication by what each one trades for what.
9. Distinguish range, hash, and directory-based sharding by their failure modes, not just their definitions.
10. Define RPO and RTO, and explain why backups and replication are not substitutes for each other.

## Section B — Explain in your own words

11. Explain why an index doesn't guarantee the planner will use it, using the actual cost-comparison logic.
12. Explain why "READ COMMITTED prevents race conditions" is false, with a concrete anomaly it permits.
13. Explain why a single long-running open transaction can degrade vacuum performance database-wide, not just on tables it touches.
14. Explain why ACID's Consistency and CAP's Consistency (previewed, formalized in Level 7) are different concepts.
15. Explain the Expand-Contract migration pattern's three phases and what breaks if Contract happens too early.

## Section C — Scenario diagnosis

16. A query that was fast in staging is slow in production on a much larger table. Using `EXPLAIN ANALYZE`, you find a huge gap between estimated and actual row counts. Diagnose and propose a fix.
17. Two concurrent requests to your `POST /transfer` endpoint under Read Committed isolation both succeed even though the account shouldn't have had sufficient balance for both. Diagnose the exact race and the fix.
18. A read-replica-backed API shows a user their own just-submitted data as missing immediately after submission, then present a few seconds later on refresh. Diagnose.
19. A production incident: `autovacuum` hasn't run successfully on a critical table in days, and query performance is degrading. What's your diagnostic process, and what's the most likely root cause given this module's content?
20. A schema migration deployed a `NOT NULL` column addition directly, and the deploy caused a multi-second outage on a large table. Diagnose what went wrong and redesign the migration using this module's content.

## Section D — Trade-off reasoning

21. Argue for or against denormalizing a specific described field (given in conversation) — using the "does this value depend on this row" test, not a general preference.
22. Defend a specific isolation-level choice (Read Committed + explicit locking vs. Serializable + retry logic) for Project 2's transfer operation.
23. Argue for or against sharding a specific described workload (given in conversation) — walking through every lower-complexity alternative first.

## Section E — System design

24. Design the complete database layer for Project 2: schema (with explicit normalization/denormalization decisions and constraints), transaction/isolation strategy for the core transfer operation, partitioning scheme, replication topology (sync vs. async, and where), connection pooling setup, and backup/recovery strategy with stated RPO/RTO targets. Justify every decision against a specific lesson in this module.

## Section F — Debug

25. You'll be handed a schema, a slow query, and its `EXPLAIN ANALYZE` output (in conversation). Diagnose the root cause and propose the specific fix — index, query rewrite, or statistics refresh — with justification for why you ruled out the other two.

---

**On passing:** update `PROGRESS.md` — Module 3 status to "Complete," log per-topic mastery and misconceptions caught. Module 4 (Data Access) unlocks next — it directly builds on this module's content (ORM/query-builder trade-offs only make sense once you understand what they're abstracting over).
