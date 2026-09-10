# Relational Modeling & Normalization

## 1. Why does this exist?

A schema is a set of claims about what facts can coexist without contradiction. A badly modeled schema doesn't just look ugly — it actively permits your data to become internally inconsistent (two rows disagreeing about the same fact) in ways application code then has to work around forever. Normalization is the formal discipline for designing a schema where each fact has exactly one authoritative location.

## 2. Mental model

Think of a normalized schema as a single source of truth per fact, connected by references, versus a denormalized schema as photocopies of that fact scattered around for convenience — fast to read, but every photocopy is a place the original can silently drift out of sync if you forget to update it too.

## 3. Simple explanation

Normalization proceeds through **normal forms**, each fixing a specific class of anomaly the previous one still permits:
- **1NF**: every column holds a single, atomic value — no arrays/repeating groups crammed into one field, and every row is uniquely identifiable.
- **2NF**: every non-key column depends on the *entire* primary key, not just part of a composite key (only relevant when the primary key itself is composite).
- **3NF**: no non-key column depends on *another non-key column* — every non-key column must depend on the key, the whole key, and nothing but the key.
- **BCNF**: a stricter version of 3NF closing a specific edge case 3NF misses — every determinant (anything that functionally determines another column) must itself be a candidate key.

## 4. Technical explanation

**What each violation actually costs you in practice, not just in theory:** a 1NF violation (a comma-separated list of tags in one column) makes querying/indexing individual values essentially impossible without string-parsing hacks. A 2NF/3NF violation (e.g., storing both `customer_id` and `customer_city` on an `orders` table, where `customer_city` depends on the customer, not the order) creates **update anomalies**: change a customer's city, and now every historical order row for that customer either needs updating (expensive, easy to miss some) or is left stale and contradicting the customer's actual current record — the database itself provides no mechanism to keep the two in sync, because nothing declares they must be.

**Insertion, update, and deletion anomalies, named precisely:** an *insertion anomaly* is being unable to record a fact (a new product category) without also having an unrelated fact available (a product in it) because they're wrongly conflated in one table. An *update anomaly* is the redundant-data-drift problem above. A *deletion anomaly* is losing a fact you wanted to keep (the existence of a category) as a side effect of deleting something else (the last product in it) — a direct consequence of not giving that fact its own table/row.

**Why 3NF is the pragmatic production default, not full BCNF or higher:** the further normal forms (4NF, 5NF, dealing with multi-valued and join dependencies) address genuinely rare real-world modeling situations; going past 3NF/BCNF for a typical OLTP schema usually buys diminishing correctness value against real, mounting join complexity. The practical guidance that holds up in production: **normalize for correctness first (3NF as the default target for OLTP schemas, where write-correctness and avoiding update anomalies matters most), then denormalize deliberately and locally, only after a measured performance problem, never preemptively.**

**Denormalization, done correctly, is not "giving up on normalization" — it's a targeted, accountable trade:** a legitimate denormalization decision names exactly what's duplicated, exactly what keeps it in sync (a database trigger, an application-level transaction, an async reconciliation job), and exactly why the join cost of the normalized version was measured to be a real problem — as opposed to "copying customer details into every order row just in case," which is denormalization without the accountability that makes it defensible. A cached, transactionally-maintained `order_total` column is a reasonable denormalization (derived, single writer, kept in sync inside the same transaction that changes line items); copying mutable customer data into every historical order without a sync mechanism is not, unless you specifically want to intentionally preserve that data as a **historical snapshot** at time of order — which is actually a different, legitimate modeling reason entirely (see below).

**A frequently-missed nuance: "denormalized-looking" data is sometimes actually correctly modeled, not a violation at all.** Storing a customer's *shipping address as it was at the time of the order* on the order row isn't a 3NF violation — it's capturing a fact that's true about the order specifically (what address it shipped to), not a stale copy of a fact that belongs to the customer. The test isn't "is this data duplicated somewhere else" — it's "does this column's value actually, semantically depend on the *order*, or does it depend on the *customer* and just happen to have been copied." Confusing these two is a common, real modeling mistake in both directions.

## 5. How it works internally

Postgres enforces none of the normal forms directly — they're a design discipline you apply when defining tables, columns, and foreign keys; the database only enforces the *constraints* you actually declare (Lesson 8 covers this precisely). A `CREATE TABLE` reflecting a 3NF design typically shows up as more, narrower tables connected by foreign keys, versus a denormalized design's fewer, wider tables — the schema itself is the visible artifact of the modeling decision.

## 6. Example

```sql
-- Un-normalized: customer_city duplicated on every order, no single
-- source of truth, update anomaly waiting to happen.
CREATE TABLE orders (id serial PRIMARY KEY, customer_id int, customer_city text, total numeric);

-- 3NF: customer_city lives exactly once, on customers.
CREATE TABLE customers (id serial PRIMARY KEY, city text);
CREATE TABLE orders (id serial PRIMARY KEY, customer_id int REFERENCES customers(id), total numeric);
```

## 7. Code

```sql
-- A deliberate, accountable denormalization: order_total is derived and
-- redundant with SUM(line_items.price * qty), but kept correct inside
-- the same transaction that ever changes line_items — never an
-- independent, driftable copy.
BEGIN;
  INSERT INTO line_items (order_id, price, qty) VALUES (42, 1999, 2);
  UPDATE orders SET total = total + 1999 * 2 WHERE id = 42;
COMMIT;
```

## 8. Failure scenarios

- **A customer's address changes and historical orders silently show the new address** because the schema stored a foreign key reference instead of a point-in-time snapshot — a real, common e-commerce/fintech modeling bug where "what address did this order actually ship to" retroactively changes, which is factually wrong.
- **Denormalized counts/totals drifting from reality** because the sync mechanism (a trigger, an application write) was bypassed by some code path (a bulk import, a manual `UPDATE`) that didn't know it needed to also update the derived column.
- **A 2NF violation surfacing only under a specific composite-key table** (e.g., an `order_items` table keyed on `(order_id, product_id)` that also stores `product_name`, which depends only on `product_id`, not the full key) — invisible until a product is renamed and old order-item rows show the stale name inconsistently with the products table.

## 9. Common misconceptions

- **"Normalization is always the correct default and denormalization is always a mistake."** Denormalization, done deliberately and accountably, is a legitimate, common production technique — the mistake is doing it *without* naming what's duplicated and how it's kept in sync.
- **"More normal forms is always better."** Diminishing, often negative practical returns past 3NF/BCNF for typical OLTP schemas — this isn't a "more is better" scale.
- **"Storing a snapshot of data on a row (like a shipping address at order time) is a normalization violation."** It's correct modeling of a fact that genuinely belongs to that row's point in time, not a stale copy of a fact that belongs elsewhere.

## 10. Trade-offs

Normalized: no update anomalies, single source of truth, more joins at read time. Denormalized: faster reads, no join cost, real risk of drift unless the sync mechanism is deliberate and enforced. The right schema for a given table is rarely "fully normalized" or "fully denormalized" uniformly — it's normalized by default with specific, justified, accountable exceptions.

## 11. Real-world applications

- Financial ledgers (directly relevant to Project 2) are a canonical case where point-in-time snapshotting (the transaction amount, the exchange rate *at the time*) is correct modeling, not denormalization — a later change to a live "current exchange rate" table must never retroactively alter a settled transaction's recorded amount.
- Analytics/reporting systems routinely denormalize deliberately (wide, flat tables) specifically because read performance dominates and write-path complexity is comparatively unimportant — a different set of priorities than an OLTP system, and a legitimate reason to model the same underlying facts differently in different tables.

## 12. Connections

Sets up Lesson 2 (joins exist specifically to reassemble normalized data at query time) and Lesson 3 (index design decisions are shaped by your schema's join patterns). Directly informs Project 2's ledger design — snapshot-vs-reference is exactly the modeling question a payment platform's schema hinges on.

## 13. Practical exercise

Take a schema you've built with at least one denormalized field. For each, determine: is it a legitimate snapshot (correctly modeling a fact tied to that row's moment in time), a deliberate, accountable performance denormalization (name its sync mechanism), or an unaccountable duplication with no defined sync — and fix any that fall in the third category.

## 14. Challenge

Design the core ledger schema for Project 2: accounts, transactions, and running balances. Decide explicitly what's normalized (a single source of truth) versus what's a deliberate, transactionally-maintained denormalization (e.g., a cached balance), and justify each choice.

## 15. Mastery test

- Define 1NF, 2NF, and 3NF precisely enough to correctly classify a violation given a sample schema.
- Explain insertion, update, and deletion anomalies with a concrete example of each, distinct from one another.
- Distinguish a legitimate point-in-time snapshot from an unaccountable denormalization, using the "does this value semantically depend on this row" test.
