# Partitioning, Sharding & Backups — Splitting Data Across Boundaries, and Surviving Losing It

## 1. Why does this exist?

Every technique in this module so far assumed one table fits reasonably on one machine. Eventually — a table too large for efficient maintenance operations, or a workload too large for one server's capacity — that assumption breaks, and you need a deliberate strategy for splitting data across boundaries: within one database (partitioning) or across multiple databases entirely (sharding). Backups exist because every other guarantee in this module (ACID, replication) protects against *some* failures, but none of them protect against the class of failure where the data itself becomes wrong (a bad migration, a bug that corrupts rows, a `DELETE` without a `WHERE` clause) — replication faithfully propagates that corruption to every replica just as fast as it propagates anything else.

## 2. Mental model

**Partitioning** is reorganizing one very large filing cabinet into labeled drawers within the same room — still one system, one set of keys, but operations that only need one drawer's contents (a query filtered to one partition) don't have to search the whole cabinet. **Sharding** is moving to multiple separate rooms in different buildings entirely — each shard is genuinely a separate database, and something (your application, or a routing layer) has to know which building to walk into for a given piece of data. A backup is a photograph of the filing cabinet's exact contents at a specific moment, kept somewhere a fire in the main room can't reach.

## 3. Technical explanation

**Partitioning — splitting one logical table into physically separate pieces, still within one Postgres instance, transparent to most queries:** Postgres's **declarative partitioning** lets you define a table as partitioned by range, list, or hash on some column, with each partition being its own physical table underneath. The query planner (Lesson 4) performs **partition pruning** — if a query's `WHERE` clause constrains the partition key, the planner can skip scanning partitions that couldn't possibly contain matching rows entirely, without you writing any partition-aware SQL yourself. This directly, concretely helps two separate things: query performance (less data to scan) and **maintenance operations** — `VACUUM` (Lesson 7), index rebuilds, and even bulk deletes (dropping an entire old partition is a fast metadata operation, versus a slow, bloat-generating `DELETE` of millions of individual rows) all become dramatically cheaper when scoped to a single, smaller partition instead of one enormous table.

**A directly relevant, common real pattern worth naming explicitly: time-based range partitioning for append-heavy, time-series-shaped data (exactly Project 2's transaction ledger, or an audit log — Level 10 previews this further):** partition a `ledger_entries` table by month or day on its `created_at` column; old partitions that are no longer actively written to become effectively read-only and can be moved to cheaper storage, archived, or dropped per a retention policy, as a fast metadata operation rather than a slow row-by-row delete — this is a genuinely standard, production-proven design pattern for exactly this data shape.

**Sharding — when partitioning within one instance isn't enough, because the workload itself has outgrown a single machine's total capacity (CPU, memory, disk I/O, not just table size):** the three strategies (introduced conceptually in Module 1, Lesson 8's load-balancer content, now applied to data storage rather than request routing — the same underlying idea, a different layer):
- **Range-based sharding**: shard by a range of a key (e.g., customer IDs 1–1M on shard A, 1M–2M on shard B). Easy to reason about, efficient for range queries within one shard — but prone to **hot-spotting**: new customers/activity cluster at the high end of an ID range, meaning the newest shard often absorbs disproportionate write load while older shards sit comparatively idle.
- **Hash-based sharding**: hash the key to determine shard placement, distributing load far more evenly, at the cost of losing range-query locality (a range query now has to fan out to every shard, since consecutive keys are deliberately scattered). Directly connects back to Module 1, Lesson 8's consistent-hashing content — hash-based sharding with consistent hashing specifically minimizes how much data must move when the shard count changes, for exactly the same reason consistent hashing minimized backend remapping for load balancing.
- **Directory-based sharding**: an explicit lookup table/service maps keys to shards, allowing arbitrary, even manually-overridden placement logic (useful for deliberately co-locating a specific large customer's data on dedicated infrastructure) — the most flexible option, at the cost of that lookup layer itself becoming a new dependency and potential bottleneck/single point of failure in the request path.
- **The practical, current-practice guidance**: hash-based sharding with consistent hashing is the sound default for most workloads; directory-based sharding is reached for specifically when you need placement control finer than a hash function can express, not as a default starting point.

**Sharding's real, structural costs — not a free scaling lever, worth stating plainly since it's frequently underestimated:** cross-shard queries (anything that can't be answered from a single shard) become genuinely hard — joins across shards aren't native SQL operations anymore, and require either application-level fan-out-and-merge logic or a specialized query layer; transactions spanning multiple shards lose the single-database ACID guarantees Lesson 5 described entirely, requiring the distributed-transaction patterns (2PC, sagas) Level 7 covers, which are themselves a real complexity and consistency trade-off, not a drop-in replacement. This is precisely why sharding is a last-resort scaling technique after partitioning, replication-based read scaling, and vertical scaling (a bigger machine) have been genuinely exhausted — not a default architecture to reach for preemptively.

**Backups — a genuinely different, distinct guarantee from replication, worth stating precisely because they're commonly conflated:** replication protects against *hardware/node failure* (a machine dying) by keeping a live, current copy elsewhere — but it does **not** protect against *logical corruption* (a bad migration, an accidental mass-`DELETE`, a bug silently writing wrong values), because a replica faithfully replicates exactly that corruption, just as quickly as it replicates anything correct. A **point-in-time recoverable backup** (Postgres's base backups plus continuous WAL archiving, letting you restore to any specific moment, not just the moment of the last full backup) is what actually protects against logical corruption — by letting you go back to a moment *before* the mistake happened, which no amount of replication can do, because every replica was faithfully following the mistake in real time too.

**Recovery Point Objective (RPO) and Recovery Time Objective (RTO) — the two numbers that actually define a backup strategy, worth knowing precisely because "we have backups" is not itself a complete answer:** RPO is "how much data are we willing to lose" (the gap between your last recoverable point and the moment of failure — determined by your backup/WAL-archiving frequency); RTO is "how long can we tolerate being down while recovering" (determined by how fast you can actually restore a backup and replay WAL forward to the desired point, which for a large database can be a genuinely long, real operational process, not an instant switch). A backup strategy that's never actually been tested via a real restoration exercise has an **unknown**, not merely optimistic, RTO — this is a real, common, entirely preventable production risk.

## 4. How it works internally

Postgres's continuous WAL archiving (the same WAL from Lesson 5's durability mechanism and Lesson 9's replication, reused a third time for a third distinct purpose) lets a base backup plus the archived WAL stream since that backup be replayed forward to reconstruct the database's exact state at any chosen point in time — this is the actual mechanism behind "point-in-time recovery," not a separate, unrelated backup technology.

## 5. Example

```sql
CREATE TABLE ledger_entries (
  id bigserial, account_id int, amount numeric, created_at timestamptz
) PARTITION BY RANGE (created_at);

CREATE TABLE ledger_entries_2026_09 PARTITION OF ledger_entries
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
```

## 6. Code

```sql
-- Dropping an old partition: a fast metadata operation, NOT a slow,
-- bloat-generating row-by-row DELETE of potentially millions of rows —
-- a direct, concrete payoff of Lesson 7's vacuum content, avoided
-- entirely for archived data.
DROP TABLE ledger_entries_2024_01;
```

## 7. Failure scenarios

- **A bad migration or a mistaken bulk `UPDATE`/`DELETE` propagating instantly and faithfully to every replica**, leaving replication-based redundancy completely unable to help — exactly why backups and replication are not substitutes for each other.
- **A backup strategy that's never been test-restored**, discovered to actually be broken (corrupted archive, missing WAL segment, an RTO far longer than assumed) precisely during a real incident, when it's too late to fix calmly.
- **Range-sharding by a monotonically increasing ID**, producing exactly the hot-spotting problem described above — the newest shard becomes a bottleneck while older shards sit underutilized, discovered only once write volume grows enough to matter.

## 8. Common misconceptions

- **"We have replication, so we don't need backups."** Replication and backups protect against structurally different failure classes (hardware failure vs. logical corruption) — this is arguably the single most important, most commonly gotten wrong distinction in this entire lesson.
- **"Sharding is the natural next step once a database gets big."** Partitioning (within one instance), read replicas, and vertical scaling are all lower-complexity-cost options that should genuinely be exhausted first — sharding's cross-shard query and transaction costs are real, ongoing complexity taxes, not one-time setup costs.
- **"A backup that completes successfully is a working backup."** A successful backup *creation* says nothing about whether *restoration* actually works and completes within your required RTO — only a tested restore proves that.

## 9. Trade-offs

Partitioning: real maintenance and query-performance wins for large, naturally-partitionable data (especially time-series-shaped), with genuine design constraints (the partition key needs to actually align with your access patterns, or pruning doesn't help). Sharding: real horizontal scaling beyond a single machine's ceiling, at the cost of losing native cross-shard joins/transactions — a serious, not-to-be-underestimated architectural commitment. Backups: an ongoing operational cost (storage, testing discipline) buying protection against the one failure class replication structurally cannot address.

## 10. Real-world applications

- Project 2's ledger table is a textbook time-based-partitioning candidate — directly, immediately applicable, not hypothetical.
- Any system claiming financial-grade reliability (again, directly relevant to your stated fintech interest) needs a genuinely tested, known-RPO/RTO backup and recovery strategy as a baseline, non-optional requirement, not an afterthought bolted on after launch.

## 11. Connections

Directly depends on Lesson 4 (partition pruning is a query-planner behavior), Lesson 7 (partition-drop as an alternative to bloat-generating mass deletes), and Lesson 9 (replication and backups both reuse the WAL mechanism, for genuinely different purposes). Sets up Level 7's distributed-transaction content (sharding's cross-shard transaction problem is exactly what that level's 2PC/saga content addresses) and Level 10 (RPO/RTO are core disaster-recovery vocabulary that module formalizes further).

## 12. Practical exercise

Design the partitioning scheme for Project 2's ledger (partition key, interval, retention policy for old partitions) and write the DDL for creating the current and next month's partitions, plus the logic for automating that creation going forward (a real, necessary operational detail — partitions don't create themselves).

## 13. Challenge

Your production database, currently a single Postgres instance with read replicas, has grown to the point where write throughput on one table is the genuine bottleneck, not read capacity. Walk through, in order, every lower-complexity option this lesson named that should be evaluated and ruled out before committing to sharding, and state what evidence would tell you each option is genuinely insufficient.

## 14. Mastery test

- Explain precisely why replication cannot protect against logical corruption, using a concrete example of a mistake it would faithfully propagate.
- Explain partition pruning well enough to state, for a given query and partitioning scheme, whether pruning would actually help.
- Define RPO and RTO precisely enough to distinguish them, and explain why "we have backups" alone doesn't specify either number.
- Explain the hot-spotting problem with range-based sharding on a monotonically increasing key, and why hash-based sharding avoids it at a specific, named cost.
