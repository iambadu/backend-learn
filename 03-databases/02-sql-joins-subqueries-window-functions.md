# SQL — Joins, Subqueries, and Window Functions

## 1. Why does this exist?

Normalization (Lesson 1) splits data across tables; SQL's join and query-composition machinery is how you reassemble it at query time without denormalizing. Most developers who "know SQL" through an ORM know a narrow slice of this — enough for simple CRUD, not enough to express genuinely relational questions ("this month's top customer per region") without falling back to fetching everything and computing in application code, which is almost always the wrong layer to do it in.

## 2. Mental model

A join is set intersection/combination logic, executed by the database, not a loop you'd write by hand. A subquery is a query used as a value or a table inside another query — a way to compose smaller relational questions into a bigger one. A window function is "aggregate, but without collapsing rows" — you get a per-row result *and* an aggregate computed over a related set of rows, simultaneously.

## 3. Technical explanation

**Join types, precisely, not just "the four kinds":**
- **INNER JOIN**: rows from both tables where the join condition matches — non-matching rows from either side are dropped entirely.
- **LEFT (OUTER) JOIN**: every row from the left table, matched rows from the right where they exist, `NULL` for the right table's columns where they don't — the standard way to answer "give me all X, with Y if it exists."
- **RIGHT JOIN**: the mirror of LEFT — rarely used in practice because you can always rewrite it as a LEFT JOIN by swapping table order, and most style guides prefer that for consistency.
- **FULL OUTER JOIN**: all rows from both sides, `NULL`-padded wherever a match is missing on either side — used far less often, but the right tool for "show me every mismatch in either direction" reconciliation queries (directly relevant to Project 2's reconciliation requirement).
- **CROSS JOIN**: the Cartesian product — every row of A paired with every row of B, no condition at all. Rare as a deliberate choice, but a common *accidental* bug: forgetting a `JOIN` condition silently produces one, multiplying row counts explosively.

**The specific mechanical reason join order and indexing interact — previewed properly in Lesson 4, but worth naming here:** the query planner chooses a join algorithm (nested loop, hash join, merge join) based on table sizes and available indexes on the join columns — a join on an unindexed foreign key forces a nested-loop scan that's `O(n × m)` in the worst case, versus an indexed join that can be closer to `O(n log m)` or better. This is precisely why foreign key columns should almost always be indexed — a decision that feels like a Level-3-internals concern but has direct, first-order consequences for every join you write.

**Subqueries — three distinct usage shapes, each with different execution implications:**
- **Scalar subquery** (returns exactly one value, used where a single value is expected): `WHERE amount > (SELECT AVG(amount) FROM orders)`.
- **Correlated subquery** (references a column from the *outer* query, and is conceptually re-evaluated per outer row): `SELECT * FROM customers c WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)`. A correlated subquery can be a real performance trap if the planner can't rewrite it into a join-equivalent form internally — worth checking with `EXPLAIN` (Lesson 4) rather than assuming.
- **Common Table Expressions (CTEs, `WITH ... AS (...)`)**: named, composable subqueries, primarily for readability and for expressing recursive queries (`WITH RECURSIVE`, used for hierarchical data — an org chart, a category tree) that plain joins structurally cannot express, since a join has no notion of "repeat until no more rows match."

**Window functions — genuinely distinct from `GROUP BY`, and the most underused, highest-leverage SQL feature for full-stack developers to actually learn:** a `GROUP BY` aggregate collapses N rows into 1; a window function computes an aggregate *over a defined window of related rows* while still returning all N rows individually. The syntax `func(...) OVER (PARTITION BY ... ORDER BY ...)` defines that window: `PARTITION BY` groups rows for the calculation (analogous to `GROUP BY`, but without collapsing), and `ORDER BY` inside the window (when present) makes the function's calculation cumulative/positional rather than over the whole partition at once.
- `ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC)` — gives each customer's orders a rank by recency, in one query, no application-side post-processing — directly enables "top N per group" queries (e.g., "each customer's 3 most recent orders") that are notoriously awkward to express with plain `GROUP BY`.
- `SUM(amount) OVER (PARTITION BY account_id ORDER BY created_at)` — a running/cumulative balance, computed entirely in SQL — directly relevant to Project 2's ledger, where a running balance derived from an immutable transaction log (rather than a separately-maintained, driftable balance column) is often the more correct design.
- `LAG()`/`LEAD()` — access the previous/next row's value within a window without a self-join — e.g., computing the time gap between a customer's consecutive orders.

## 4. How it works internally

The query planner (Lesson 4 gives this its own full treatment) decides join *algorithm* independent of the SQL join *syntax* you wrote — an `INNER JOIN` you wrote might execute as a hash join, a merge join, or a nested loop, chosen based on table statistics, not your syntax. This is precisely why "the same logical query, written two syntactically different ways, can perform very differently" is a real, common surprise — the planner's cost-based choice depends on more than the SQL's surface shape.

## 5. Example

```sql
-- Each customer's most recent order, without a slow correlated subquery
-- or an awkward GROUP BY MAX(created_at) + self-join:
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn
  FROM orders
) ranked WHERE rn = 1;
```

## 6. Code

```sql
-- A running ledger balance, directly relevant to Project 2 — derived
-- from an immutable transaction log rather than a mutable balance column:
SELECT
  id, amount, created_at,
  SUM(amount) OVER (PARTITION BY account_id ORDER BY created_at
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
FROM ledger_entries
WHERE account_id = 42
ORDER BY created_at;
```

## 7. Failure scenarios

- **An accidental CROSS JOIN** from a missing or malformed join condition — row counts multiply silently, often not caught until a query that should return dozens of rows returns millions.
- **A correlated subquery re-executing per outer row** without the planner being able to optimize it into a join — a real, measurable performance cliff on large tables, invisible until you check `EXPLAIN`.
- **Fetching all rows and computing a running total / ranking in application code** instead of using a window function — pulls far more data across the network than necessary (Module 1's bandwidth content) and duplicates logic the database engine is specifically optimized to perform.

## 8. Common misconceptions

- **"Window functions are just a fancier GROUP BY."** They solve a structurally different problem — retaining per-row detail while still computing an aggregate relationship between rows — that `GROUP BY` cannot express at all without a subsequent join back to the original rows.
- **"A LEFT JOIN and a subquery with EXISTS are always interchangeable."** They can produce different results with duplicate matches on the right side (a LEFT JOIN can multiply left-side rows if multiple right-side rows match, `EXISTS` never does) — a real, subtle bug source when swapping one for the other without checking.
- **"RIGHT JOIN is a distinct capability from LEFT JOIN."** It's the same operation with table order swapped — knowing this avoids unnecessary cognitive overhead and inconsistent codebase style.

## 9. Trade-offs

Doing aggregation/ranking/running-totals in SQL (via window functions) versus in application code: SQL keeps computation next to the data (avoiding transferring the raw rows over the network just to compute something over them) and leverages engine-level optimization, at the cost of SQL's own learning curve and, for very complex business logic, sometimes worse readability/testability than equivalent application code.

## 10. Real-world applications

- Leaderboards, "top N per category" listings, and running balances (all three genuinely common product features) are close to the textbook window-function use cases.
- Reconciliation logic (Project 2) — comparing two ledgers for mismatches — leans directly on `FULL OUTER JOIN`.

## 11. Connections

Depends on Lesson 1 (joins exist to reassemble normalized data) and directly sets up Lesson 4 (query planning determines how any given join/subquery actually executes, regardless of its SQL syntax).

## 12. Practical exercise

Write a query producing each customer's 3 most recent orders using `ROW_NUMBER()`, then rewrite the same result using a correlated subquery instead, and compare their `EXPLAIN ANALYZE` output (Lesson 4) on a table with a meaningful number of rows.

## 13. Challenge

For Project 2, write a reconciliation query using `FULL OUTER JOIN` between your internal ledger and a simulated external payment-provider record set, surfacing exactly the rows that exist on only one side or disagree in amount.

## 14. Mastery test

- Explain precisely what distinguishes a window function from `GROUP BY`, in terms of what happens to the row count.
- Explain why an accidental CROSS JOIN is dangerous and how it typically happens by mistake.
- Explain why LEFT JOIN and EXISTS-based filtering can produce different row counts under duplicate matches, with a concrete example.
