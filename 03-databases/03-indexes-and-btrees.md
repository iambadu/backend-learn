# Indexes & B-Trees — What's Actually Stored, and Why Indexes Can Make Things Slower

## 1. Why does this exist?

"Add an index" is the most common piece of database advice given, and the least commonly understood mechanically. An index is not a free performance switch — it's a genuine, separate data structure with its own storage cost, its own maintenance cost on every write, and specific conditions under which the query planner will and won't actually use it. Module 2 Lesson 7 already leaned on "an index lets the database seek instead of scan" without explaining the structure that makes that true — this lesson supplies it.

## 2. Mental model

A table without an index is a phone book with entries in the order people happened to sign up, not alphabetically — finding one person means checking every entry (a scan). An index is a separate, ordered copy of just the column(s) you're searching on, each entry pointing back to where the full row actually lives — like an alphabetized card catalog referencing a book's shelf location, letting you jump directly to the right region instead of reading the whole shelf.

## 3. Simple explanation

A **B-tree** (balanced tree) is the default index structure in Postgres (and most relational databases) — a tree where every leaf is the same distance from the root, keys are kept sorted, and each node holds multiple keys/pointers (not just two, like a binary tree), specifically to keep the tree shallow even for millions of rows, minimizing the number of disk-page reads needed to find anything. Finding a value means starting at the root and following pointers downward, comparing against each node's keys, in `O(log n)` steps.

## 4. Technical explanation

**Why an index costs something on every write, and why this matters for index-design decisions, not just read performance:** every `INSERT`, `UPDATE` (on an indexed column, or on any column with `UPDATE`'s row-versioning behavior — Lesson 7 covers why), and `DELETE` must also update every index touching that table, not just the underlying table's heap storage — an index isn't a free-standing cache, it's actively maintained state. A table with five indexes pays five times the index-maintenance write cost on every insert, which is exactly why "just add an index for every column you ever filter on" is bad advice: index count is a real, direct write-throughput cost, not a free win.

**Why the planner sometimes *ignores* an available index — this is the specific misconception Level 3's roadmap flags, and it's genuinely counterintuitive without the mechanism:** if a query is expected to return a large fraction of a table's rows (a commonly cited rule of thumb is roughly above ~5-10%, though the real threshold is workload- and hardware-specific, decided by the planner's actual cost estimates, not a fixed universal number), a **sequential scan** — reading every row from disk in physical order — can be cheaper than an index scan, because an index scan involves jumping around the table's physical storage in whatever order the index entries happen to point to (random I/O), while a sequential scan reads disk pages in order (much cheaper per page on spinning disks, and still meaningfully cheaper on SSDs due to prefetching and reduced per-page overhead). The planner estimates both costs (based on table statistics it maintains — row counts, value distribution) and picks the cheaper one; an index existing doesn't obligate the planner to use it.

**Covering indexes and index-only scans — the specific mechanism that lets a query avoid touching the underlying table (the "heap") at all:** normally, an index only stores the indexed column(s) plus a pointer to the full row's location on disk (the heap) — so even after the index narrows down which rows match, the database still has to fetch each matching row from the heap to get any *other* columns the query asked for (a "heap fetch"). If an index additionally stores (via Postgres's `INCLUDE` clause) every column the query needs, the database can satisfy the entire query from the index alone — an **index-only scan**, skipping the heap fetch entirely. This is a genuinely significant, measurable optimization for read-heavy, narrow queries, but it comes with a real caveat: Postgres still needs to confirm each index entry's visibility (whether that row version is visible to the current transaction — Lesson 7's MVCC content) via the heap's visibility map, so an index-only scan's benefit is largest on tables that are `VACUUM`ed frequently enough that the visibility map stays current — on a heavily-bloated, rarely-vacuumed table, the promised benefit partially evaporates.

**What actually determines whether a composite (multi-column) index is usable for a given query — a real, specific rule, not a vague heuristic:** a B-tree index on `(a, b, c)` is usable for filtering on `a` alone, or `a` and `b` together, or all three — but generally **not** usable for filtering on `b` or `c` alone, because the index's sort order is nested left-to-right (sorted by `a` first, then `b` within each `a`, then `c` within each `b`) — skipping the leading column breaks the ability to seek directly, the same way you can't efficiently find "everyone with last name Smith" in a phone book sorted by (first name, last name). This is the single most common real-world composite-index mistake: creating `(a, b)` and expecting it to help a query filtering only on `b`.

**Why some indexes explicitly aren't B-trees, briefly, since it's worth knowing the default has alternatives:** GIN (Generalized Inverted Index) indexes full-text search and array/JSONB containment queries, where a B-tree's sorted-scalar-value assumption doesn't fit; GiST indexes handle geometric/range-overlap queries. **GIN indexes cannot support index-only scans** — a specific, real limitation worth knowing if you're reaching for full-text search and expecting B-tree-index-only-scan-level performance by default.

## 5. How it works internally

A B-tree index's leaf nodes are chained together in sorted order, so once the tree traversal reaches the right starting leaf, a range scan (`WHERE id > 100 AND id < 200`, or Module 2 Lesson 7's keyset pagination) can simply walk forward along the leaf chain rather than re-traversing the tree per row — this is precisely the mechanism that makes keyset pagination's cost independent of position: it's a bounded tree descent plus a linear walk of exactly the rows returned, never touching the rows skipped.

## 6. Example

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;
-- "Index Scan using orders_customer_id_idx" vs "Seq Scan on orders"
-- — the planner's actual choice, made visible (full treatment in Lesson 4).
```

## 7. Code

```sql
-- Composite index: usable for queries filtering on customer_id alone,
-- or customer_id + status together — NOT for status alone.
CREATE INDEX idx_orders_customer_status ON orders (customer_id, status);

-- Covering index: satisfies a query needing customer_id, status, and total
-- entirely from the index, no heap fetch — an index-only scan.
CREATE INDEX idx_orders_covering ON orders (customer_id) INCLUDE (status, total);
```

## 8. Failure scenarios

- **An index that's never actually used** because the query planner determined a sequential scan was cheaper (small table, or query returning too large a fraction of rows) — the index still pays its write-maintenance cost on every insert/update/delete, for zero read benefit, a real, silent tax worth auditing for (Postgres's `pg_stat_user_indexes` surfaces unused indexes directly).
- **A composite index created in the wrong column order** for the actual query patterns, silently providing no benefit for the queries it was added for.
- **Over-indexing a write-heavy table**, degrading insert/update throughput meaningfully while providing marginal read benefit for indexes that duplicate or barely improve on existing ones.

## 9. Common misconceptions

- **"Adding an index always makes queries faster."** It makes *some* queries potentially faster (if the planner chooses to use it, and if it doesn't need to scan a large fraction of the table anyway) and makes every write on that table slower, unconditionally — the roadmap's own flagged misconception, now with the actual mechanism behind it.
- **"An index on a column means any query filtering on that column uses it."** Only if the query's filter matches the index's actual usable prefix (for composite indexes) and the planner's cost estimate favors it over a scan.
- **"Index-only scans never touch the table."** They still need to check row visibility via the visibility map — bloated, rarely-vacuumed tables can force heap fetches anyway, undermining the optimization.

## 10. Trade-offs

Indexes: faster targeted reads, slower writes, extra storage. More indexes compound both the read benefit (for the queries they actually serve) and the write cost (for every write to that table, regardless of which columns changed, if any indexed column is touched). The correct number of indexes on a table is the minimum set that covers your actual, measured query patterns — not "every column someone might someday filter on."

## 11. Real-world applications

- Foreign key columns should almost always be indexed (Lesson 2's join-performance point) — a genuinely common production gap, since Postgres does **not** automatically index foreign key columns the way some other databases do.
- Module 2 Lesson 7's keyset pagination performance claim is a direct, concrete application of this lesson's B-tree seek mechanism.

## 12. Connections

Directly extends Module 2, Lesson 7 (pagination — that lesson's O(1)-seek claim *is* this lesson's B-tree mechanism, applied). Sets up Lesson 4 (query planning — this lesson explains what indexes *are*; the next explains how the planner actually decides whether to use them, with real cost numbers).

## 13. Practical exercise

On a table with a meaningful row count (tens of thousands+), run `EXPLAIN ANALYZE` on the same filter condition twice: once where the filter matches a small fraction of rows (expect an index scan) and once where it matches a large fraction (expect a sequential scan, even with the index present). Confirm the planner's choice matches the theory in this lesson.

## 14. Challenge

Given a table with 10 columns and a documented list of the 5 actual query patterns hitting it in production, design the minimal set of indexes (including composite ordering) that covers all 5 patterns without redundant overlap, and justify each one.

## 15. Mastery test

- Explain why a B-tree index doesn't guarantee the planner will use it, in terms of the actual cost comparison being made.
- Explain the column-order rule for composite indexes precisely enough to predict whether a given index helps a given query, without running `EXPLAIN`.
- Explain what a covering index and an index-only scan actually eliminate, and why table bloat can undermine that benefit.
