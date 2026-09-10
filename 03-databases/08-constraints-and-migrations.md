# Constraints & Migrations — Enforcing Correctness, and Changing the Schema Without Breaking Production

## 1. Why does this exist?

Lesson 5 named ACID's "Consistency" as dependent entirely on your own declared constraints — this lesson is where you actually declare them, and where you confront the fact that a live production schema is never static: it has to change under a system that cannot simply be paused while you change it.

## 2. Mental model

A constraint is a rule the database itself refuses to let any row violate, regardless of which application code path wrote it — a much stronger guarantee than "our application always validates this" (Module 2, Lesson 2's point about server-side validation, one level deeper: even correct application validation doesn't protect against a manual `UPDATE`, a bug in a different service sharing the database, or a bulk import script). A migration is a deliberate, reversible-by-design sequence of schema changes, treated with the same seriousness as a code deploy — because unlike most code deploys, a bad migration can be genuinely difficult or impossible to cleanly undo once real data has flowed through the new shape.

## 3. Technical explanation

**Constraint types, and what each one actually enforces at the database level, not just documents:**
- **`NOT NULL`**: the simplest, and a real, common gap — an application-level "required field" check that isn't backed by a database-level `NOT NULL` is only as reliable as every single code path that ever writes to that table, forever.
- **`UNIQUE`**: no two rows may share the same value in the constrained column(s) — enforced via an implicitly created unique index, directly connecting to Lesson 3's index content (a `UNIQUE` constraint *is* an index, with an added uniqueness check).
- **`CHECK`**: an arbitrary boolean expression every row must satisfy (`CHECK (balance >= 0)` — directly relevant to Project 2, enforcing "an account can never go negative" at the database level regardless of what application bug might otherwise attempt it).
- **`FOREIGN KEY`**: enforces referential integrity — a row can't reference a parent row that doesn't exist, and (depending on the declared `ON DELETE`/`ON UPDATE` behavior — `CASCADE`, `RESTRICT`, `SET NULL`) controls what happens to dependent rows when a referenced row is deleted or changed. Choosing the wrong `ON DELETE` behavior is a real, common source of either silent unwanted data loss (`CASCADE` deleting more than intended) or unexpected constraint-violation errors blocking a delete you expected to succeed (`RESTRICT`).
- **`EXCLUSION` constraints** (Postgres-specific, less commonly known but directly useful for a specific real problem): generalize uniqueness to non-equality comparisons — e.g., preventing two date ranges from overlapping for the same resource, which a plain `UNIQUE` constraint structurally cannot express. Directly relevant to any booking/scheduling feature.

**Why database-level constraints matter even when your application already validates (Module 2, Lesson 2's server-side validation content, extended):** application validation only constrains writes going through *that specific code path* — a database constraint constrains **every** write, from every service, script, or manual intervention that will ever touch the table, for the entire lifetime of the schema, including code paths that don't exist yet. This is the concrete, mechanical reason "we already validate this in the API layer" is not a substitute for a database constraint on anything where correctness genuinely matters (Project 2's non-negative balance being the canonical example) — it's a different trust boundary than Module 2's API boundary, one layer deeper.

**Migrations — why "just run an `ALTER TABLE`" is dangerous on a live, large, concurrently-accessed table, and the specific pattern that avoids the danger:** some schema changes are effectively instant regardless of table size (adding a nullable column with no default, in modern Postgres versions, is a metadata-only operation) — but others (adding a `NOT NULL` column with a default value on an older Postgres version, or certain constraint additions that require scanning and validating every existing row) can require a full table scan and, worse, an exclusive lock for the duration, which on a large, high-traffic production table means a real, visible outage for every query trying to touch that table during the migration.

**The Expand-Contract (parallel change) pattern — the standard, production-grade answer to "how do you change a live schema without an outage":**
1. **Expand**: add the new column/table alongside the existing one, without touching or removing anything old — a purely additive, low-risk change.
2. **Migrate**: backfill historical data into the new shape in small batches (commonly cited as roughly 1,000–10,000 rows per batch, with a deliberate pause between batches specifically to avoid saturating I/O and starving concurrent production traffic of resources — directly connecting to Lesson 4's cost-based reasoning: a giant single-batch backfill competes for the same disk I/O and lock resources live queries need). Once backfilled, deploy application code that **writes to both the old and new columns simultaneously** (dual-write) — this specific step is what prevents the new schema from silently falling behind while the migration is still in progress.
3. **Contract**: only after confirming the new column is fully, correctly populated and every application instance has been running the dual-write code long enough that no in-flight request is still writing only to the old path, drop the old column — by this point, typically a fast, low-risk metadata operation.

**The non-negotiable rule underlying this pattern, worth stating explicitly since it's the part people skip under time pressure:** never change the schema and the application code that depends on it in the same atomic deploy step — because schema migrations and application deploys are not atomic with respect to each other (multiple application server instances roll out gradually, not simultaneously — Module 1's load-balancer content is directly relevant here: different requests hit different, not-yet-updated instances during a rollout), so both old and new code must be able to work correctly against both old and new schema shapes for the duration of any rollout, however brief.

## 4. How it works internally

Modern Postgres (specifically since version 11 for `NOT NULL`-with-default cases, and more broadly for many common `ALTER TABLE` operations) has progressively reduced how many schema changes require a full-table rewrite or long-held exclusive lock — but the specific behavior is version- and change-type-dependent, which is exactly why "check whether this specific `ALTER TABLE` is metadata-only or requires a table rewrite on this specific Postgres version" is a real, necessary step before running a migration against a large production table, not something to assume from general folklore about "ALTER TABLE is always slow" or "ALTER TABLE is always instant now."

## 5. Example

```sql
ALTER TABLE accounts ADD CONSTRAINT positive_balance CHECK (balance >= 0);
-- On an existing table with data, Postgres must validate every existing
-- row against this new constraint — a real, measurable cost proportional
-- to table size, and (depending on version/context) potentially a
-- lock-holding operation worth running during low-traffic windows or
-- using NOT VALID + VALIDATE CONSTRAINT (below) to split into two steps.
```

## 6. Code

```sql
-- Add the constraint WITHOUT validating existing rows immediately —
-- a fast, low-lock-duration operation:
ALTER TABLE accounts ADD CONSTRAINT positive_balance CHECK (balance >= 0) NOT VALID;

-- Validate separately — still scans the table, but does NOT require
-- the same exclusive lock the combined operation above would, letting
-- concurrent reads/writes continue during validation:
ALTER TABLE accounts VALIDATE CONSTRAINT positive_balance;
```

## 7. Failure scenarios

- **A single-step, big-bang schema-plus-code deploy** that assumes every application instance updates atomically — a real, common outage source during rolling deploys, where old code hits the new schema (or vice versa) mid-rollout.
- **A backfill migration run as one giant, unbatched `UPDATE`** on a large production table — starves concurrent traffic of I/O and lock resources, and (connecting to Lesson 7) generates a massive spike of dead tuples in one transaction, worsening bloat immediately.
- **Relying purely on application-level validation for a correctness-critical invariant** (non-negative balances) — a single bypassed code path (an admin script, a bug, a different service with direct database access) violates the invariant with no database-level defense.

## 8. Common misconceptions

- **"ALTER TABLE is always instant in modern Postgres."** Some operations are metadata-only; others still require a table scan and meaningful lock duration — the specific operation and Postgres version both matter, and assuming universally-instant behavior is a real, documented source of production incidents.
- **"Application-level validation makes database constraints redundant."** They protect against different, non-overlapping sets of write paths — redundancy here is deliberate defense in depth, not wasted effort.
- **"A migration is 'done' once the schema change is deployed."** Under the Expand-Contract pattern, a migration isn't safely complete until the Contract phase — deploying only the Expand phase and considering the job finished leaves the system in a permanently dual-shape, dual-write state that was only ever meant to be transitional.

## 9. Trade-offs

Database-level constraints: strong, universal correctness guarantees, at the cost of migration friction (adding a constraint to existing data requires validating that data, which has a real cost) and slightly less flexible error messages than well-crafted application-level validation can provide. The Expand-Contract pattern: real additional engineering overhead (multiple deploy phases, dual-write code that's eventually deleted) in exchange for zero-downtime schema evolution on a system that can't simply be taken offline for a migration window — a trade every production system serving live traffic eventually has to make deliberately.

## 10. Real-world applications

- Project 2's ledger absolutely needs a `CHECK (balance >= 0)`-equivalent invariant enforced at the database level, not only in application code — this is precisely the scenario this lesson's constraint content exists for.
- Every mature SaaS product's migration tooling (Rails' migrations, Django's, TypeORM/Drizzle's migration systems) is, at its core, tooling to make the Expand-Contract discipline easier to follow correctly and consistently, not a replacement for understanding why the discipline matters.

## 11. Connections

Directly grounds Lesson 5's ACID Consistency guarantee (constraints are what Consistency actually enforces) and connects to Lesson 3 (a `UNIQUE` constraint is implemented as an index) and Lesson 4 (validating an existing constraint against a large table is a query-planning-relevant, measurable cost). Sets up Level 9 (CI/CD and deployment strategies — schema migrations are a first-class part of a deployment pipeline, not a separate concern).

## 12. Practical exercise

Design an Expand-Contract migration plan for adding a `NOT NULL` `currency` column to an existing, populated `payments` table that currently assumes USD implicitly. Write out each phase's specific steps and what must be true before moving to the next phase.

## 13. Challenge

For Project 2, design every database-level constraint your ledger schema needs (beyond the obvious non-negative balance) to make it structurally impossible for a bug anywhere in your application to corrupt the ledger's core invariants, even bypassing your application's own validation layer entirely.

## 14. Mastery test

- Explain precisely why application-level validation and database-level constraints are not redundant, using a concrete write path that would bypass the first but not the second.
- Walk through the Expand-Contract pattern's three phases and explain what specifically goes wrong if the Contract phase happens too early, before all application instances have updated.
- Explain why `ADD CONSTRAINT ... NOT VALID` followed by a separate `VALIDATE CONSTRAINT` is safer for a large production table than adding a validated constraint in one step.
