# Query Planning & EXPLAIN ANALYZE — Reading What the Database Actually Did

## 1. Why does this exist?

Every SQL statement you write is a *what*, not a *how* — you declare the result you want, and the query planner decides how to actually produce it (which join algorithm, which index if any, what order to combine tables in). `EXPLAIN ANALYZE` is the tool that turns that invisible decision-making into something you can actually read and reason about, which is the difference between guessing at a performance fix and diagnosing one.

## 2. Mental model

The planner is a cost-estimating trip-planning app, not a rule-follower — given several possible routes (sequential scan, index scan, different join orders/algorithms), it estimates each one's cost using statistics about your data (how many rows, how values are distributed) and picks the cheapest *estimated* route, which is not necessarily the actual cheapest one if its statistics are stale or its estimates are wrong.

## 3. Simple explanation

`EXPLAIN` shows the planner's chosen plan and its *estimated* cost, without running the query. `EXPLAIN ANALYZE` actually **executes** the query and shows both the estimate and the real, measured numbers (actual rows returned, actual time taken) side by side — the gap between estimated and actual is itself a diagnostic signal (a large gap usually means the planner's statistics are stale or the query's shape defeats good estimation).

## 4. Technical explanation

**Cost units, and what they actually represent:** Postgres's planner estimates cost as an abstract, unitless number combining I/O cost (`seq_page_cost` — the cost of reading one page sequentially, `random_page_cost` — the cost of a non-sequential page read, deliberately configured higher by default to reflect spinning-disk seek cost, though often tuned down on SSD-backed systems) and CPU cost (`cpu_tuple_cost` per row processed, plus additional per-operator costs). A sequential scan's estimated cost is roughly `seq_page_cost × (pages in the table) + cpu_tuple_cost × (rows in the table)` — a formula worth internalizing because it directly explains why sequential scan cost scales with table size regardless of how selective your filter is, while index scan cost scales primarily with how many rows actually match.

**Reading a plan's shape, from the bottom up (plans are read innermost-operation-first, since outer operations consume inner ones' output):**
- **Seq Scan**: read every page/row in physical order, filtering as it goes. Cost scales with table size, not result size.
- **Index Scan**: use an index (Lesson 3) to find matching rows, then fetch each from the heap. Cost scales roughly with result size, not table size — but each row fetch is a separate, potentially non-sequential I/O.
- **Index Only Scan**: as Lesson 3 described, no heap fetch needed if the index covers every requested column and the visibility map is current.
- **Nested Loop / Hash Join / Merge Join**: the three join algorithms the planner chooses between based on table sizes, available indexes, and whether inputs are already sorted — a nested loop (iterate one side, probe the other per row) is efficient when one side is small or well-indexed; a hash join (build an in-memory hash table from one side, probe with the other) is efficient for larger, unsorted inputs; a merge join requires both sides sorted on the join key and is efficient when that sort is already available (e.g., from an index) rather than needing to be computed.
- **Every node's line shows both `cost=` (estimated, in the planner's abstract units, shown as startup..total) and, under `ANALYZE`, `actual time=` (in real milliseconds, also startup..total) plus `rows=` (estimated) vs. the actual row count returned — comparing estimated vs. actual `rows` at each node is the single highest-value diagnostic habit this lesson can teach: a large mismatch means the planner's statistics are misleading it, and every decision built on top of that node (which join algorithm was chosen, whether an index was deemed worth using) is downstream of a bad estimate.**

**Why statistics go stale, and why this is a real, recurring operational concern, not a one-time setup step:** the planner's row-count and value-distribution estimates come from `ANALYZE` (a distinct command from `EXPLAIN ANALYZE` — confusingly similar name, different purpose: `ANALYZE` alone updates the planner's statistics, `EXPLAIN ANALYZE` executes and measures a specific query), which Postgres's `autovacuum` daemon runs automatically after enough rows have changed — but a table that just received a massive bulk load, or one where autovacuum is misconfigured/falling behind (Lesson 7 covers why), can have statistics badly out of date, causing the planner to make genuinely bad decisions (choosing a sequential scan when an index would clearly win, or vice versa) based on a stale picture of the data.

## 5. How it works internally

`EXPLAIN (ANALYZE, BUFFERS)` — a combination worth knowing beyond the bare default — additionally reports actual disk-buffer hits/misses per node, distinguishing "this was fast because it was already cached in memory" from "this was fast because the operation is genuinely cheap," a distinction that matters enormously when a query performs well in a warm-cache development environment and then underperforms on first-touch in production, or after a cache-evicting event.

## 6. Example

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE customer_id = 42;
```
```
Index Scan using idx_orders_customer_id on orders
  (cost=0.29..8.31 rows=3 width=64) (actual time=0.021..0.024 rows=3 loops=1)
  Index Cond: (customer_id = 42)
  Buffers: shared hit=4
Planning Time: 0.112 ms
Execution Time: 0.041 ms
```
Estimated rows (3) matches actual rows (3) closely — the planner's statistics are trustworthy here, and its choice of an index scan over a sequential scan is well-founded, not lucky.

## 7. Code

A deliberately stale-statistics scenario, to see the diagnostic signal directly:
```sql
-- After a large bulk INSERT, before autovacuum catches up:
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;
-- If "rows=3" (estimate) vs "actual rows=4000" (reality) diverge wildly,
-- that gap itself — not the raw timing — is the signal to run ANALYZE
-- manually rather than immediately reaching for a schema change.
```

## 8. Failure scenarios

- **A query that was fast in development and slow in production**, traced back to production's statistics being stale relative to its actual, much larger and differently-distributed data — a real, common gap between environments this lesson's diagnostic habit directly catches.
- **A planner choosing a nested loop join against a large, unindexed table** because a stale row-count estimate made the table look small — producing a plan that's catastrophically slower than the hash join it would have chosen with accurate statistics.
- **Trusting `EXPLAIN` (without `ANALYZE`) as ground truth for a performance investigation** — it shows only the *estimate*, never the actual measured behavior; a genuinely different plan may execute against real data than the estimate implies if statistics are off.

## 9. Common misconceptions

- **"A high cost number in EXPLAIN means the query is definitely slow."** Cost is an internal, relative, unitless estimate for the planner's own decision-making — it is not milliseconds, and comparing raw cost numbers across structurally different queries is meaningless; only `EXPLAIN ANALYZE`'s actual timing is directly interpretable as real-world speed.
- **"Running EXPLAIN ANALYZE is purely diagnostic and has no side effect."** It actually executes the query — for a query with side effects (an `UPDATE`/`DELETE`/`INSERT`), this is a real, sometimes-forgotten hazard; wrap it in a transaction you roll back if you need to `EXPLAIN ANALYZE` a mutating statement safely.
- **"If an index exists, a bad plan means the index is broken."** Far more often, it means statistics are stale (fixable with `ANALYZE`) or the composite-index column-order mismatch from Lesson 3 — the index working "correctly" and simply not applying to this specific query shape are easily confused.

## 10. Trade-offs

Reading `EXPLAIN ANALYZE` output correctly is a real, non-trivial skill investment, but it's the only reliable alternative to performance-tuning by superstition ("adding an index probably helps," "this query feels slow") — Level 12 will make this measurement-first discipline a hard, universal requirement, and this lesson is where that habit needs to start.

## 11. Real-world applications

- Every serious production incident involving "the database got slow" is diagnosed by pulling `EXPLAIN ANALYZE` output for the offending query, not by guessing — this is genuinely the first and most important tool in that investigation, ahead of infrastructure-level scaling responses.
- ORM-generated queries (Level 4) are exactly where this skill matters most, because the SQL an ORM produces is often not what a developer would have written by hand, and `EXPLAIN ANALYZE` is how you discover that gap.

## 12. Connections

Directly depends on Lesson 3 (you cannot interpret a plan's index-scan-vs-seq-scan choice without understanding what a B-tree actually costs to traverse) and feeds Level 12 (Performance Engineering) as the database-specific instance of that module's general "measure, don't guess" principle.

## 13. Practical exercise

Take a query from an app you've built, run `EXPLAIN ANALYZE` on it, and identify: which scan type was chosen for each table involved, whether estimated and actual row counts match closely, and — if they don't — run `ANALYZE` on the relevant table and re-check whether the plan changes.

## 14. Challenge

You're handed a slow query and its `EXPLAIN ANALYZE` output (in conversation) showing a nested loop join with a large actual-vs-estimated row-count mismatch on one side. Diagnose the root cause and propose a specific, concrete fix — not "add an index" without justification.

## 15. Mastery test

- Explain what the cost numbers in `EXPLAIN` output actually represent, and why they can't be compared directly to wall-clock time.
- Explain why a large gap between estimated and actual row counts is diagnostically significant, and what operational fix addresses it.
- Name the three join algorithms Postgres's planner can choose between and the specific condition under which each is typically favored.
