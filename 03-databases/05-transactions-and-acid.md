# Transactions & ACID — What Each Letter Actually Guarantees

## 1. Why does this exist?

"Wrap it in a transaction" is common advice; precisely what that buys you, and what it doesn't, is much less commonly understood past the acronym. Module 2 Lesson 8's idempotency-key mechanism explicitly leaned on "the same transaction" as its correctness argument without unpacking what a transaction actually guarantees — this lesson supplies that, letter by letter, because each letter is a genuinely separate guarantee with its own failure mode when misunderstood.

## 2. Mental model

A transaction is a promise that a group of operations happens as one indivisible unit, as observed by everyone else — either the whole group becomes visible and permanent together, or none of it does, and nobody outside the transaction ever sees a partially-applied state, no matter what crashes or races happen in the middle.

## 3. Simple explanation

**ACID** is four separate guarantees, each solving a different failure mode:
- **Atomicity**: all operations in a transaction succeed together, or all are rolled back together — no partial application survives.
- **Consistency**: a transaction takes the database from one valid state to another, respecting every declared constraint (Lesson 8) — this is actually the *weakest*, most application-dependent of the four (see below), often confused with the unrelated "C" in CAP (Level 7 will explicitly disambiguate these).
- **Isolation**: concurrent transactions don't see each other's uncommitted, in-progress changes — Lesson 6 gives this its own full lesson, because "isolation" is actually a *spectrum* of guarantees (isolation levels), not a single fixed property.
- **Durability**: once a transaction commits, its effects survive a crash immediately afterward — achieved via write-ahead logging (below).

## 4. Technical explanation

**Atomicity's actual mechanism — how Postgres achieves "all or nothing," not just as a promise but as an implementation:** every statement inside a transaction writes its changes, but nothing becomes visible to other transactions until `COMMIT`. If any statement fails, or the client issues `ROLLBACK`, Postgres discards every change made since `BEGIN` — this is why a multi-statement transaction that fails partway through leaves the database exactly as if none of it had run, not in some intermediate state. Mechanically, this leans on MVCC (Lesson 7): a transaction's writes create new row versions tagged with that transaction's ID, invisible to others until commit, and simply never marked visible if rolled back — atomicity and MVCC are deeply intertwined, not separate mechanisms bolted together.

**Consistency is the one letter that's genuinely different in kind from the other three — worth being precise about, since it's commonly glossed over:** atomicity, isolation, and durability are guarantees the *database engine* enforces mechanically, regardless of what your application does. Consistency is a guarantee that depends on **your own declared constraints** (foreign keys, `CHECK` constraints, `UNIQUE` constraints — Lesson 8) actually reflecting your real business rules — the database can only guarantee "no transaction leaves the database violating a constraint you told it about." A transaction that transfers money from account A to account B by decrementing A and forgetting to increment B is perfectly atomic (both statements either run or don't) and perfectly consistent *by the database's definition* (nothing declared was violated) — but is a business-logic bug, not something ACID's Consistency guarantee protects against on its own. This is precisely why application-level tests, not just "we used a transaction," remain necessary.

**Durability's actual mechanism — Write-Ahead Logging (WAL), and why this specific design choice exists:** before Postgres modifies actual data pages on disk, it first writes a record of the change to the **write-ahead log**, and only considers a transaction committed once that WAL record is confirmed flushed to durable storage. If the server crashes immediately after a commit, the actual data-page writes might not have happened yet — but on restart, Postgres replays the WAL from the last checkpoint forward, reconstructing exactly the committed state. This is *why* WAL exists as a separate mechanism rather than just writing data pages directly: sequential WAL writes are cheap and fast (Module 1's transmission-delay-style argument, applied to disk I/O — sequential writes beat random writes), letting Postgres defer the more expensive, scattered data-page writes to a convenient later point (a checkpoint) without sacrificing the durability guarantee, because the WAL alone is sufficient to reconstruct any lost work.

**The direct, load-bearing connection to Module 2 Lesson 8 and Lesson 9's transactional outbox — now made precise:** "write the idempotency record and the business effect in the same transaction" and "write the outbox event and the business change in the same transaction" both work *specifically because* of Atomicity (both writes commit together or neither does) plus Durability (once committed, a crash can't lose one but keep the other) — this lesson is the mechanical justification for what those two patterns asserted without deriving.

**What a transaction does *not* protect you from, precisely:** a transaction guarantees atomicity/isolation/durability for the operations *inside* it — it says nothing about operations that happen *outside* a transaction boundary (e.g., calling an external payment API mid-transaction, then having the transaction roll back — the external call already happened and can't be un-called, a real, specific problem Level 7's distributed-transactions/saga content addresses directly, because a single database transaction cannot span an external system).

## 5. How it works internally

`BEGIN` starts a transaction, assigning it a transaction ID; every subsequent statement's writes are tagged with that ID and kept invisible to other transactions per the active isolation level (Lesson 6); `COMMIT` flushes the transaction's WAL records to durable storage and marks it visible; `ROLLBACK` discards everything without ever making it visible, and (mechanically) simply leaves those row versions to be cleaned up by `VACUUM` (Lesson 7) as dead, never-visible tuples.

## 6. Example

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
  -- If the process crashes here, BEFORE COMMIT, neither UPDATE persists —
  -- atomicity, verified: no world exists where only one side of the
  -- transfer happened.
COMMIT;
```

## 7. Code

```ts
// The idempotency pattern from Module 2 Lesson 8, now explicitly
// justified: this ONLY provides its safety guarantee because both
// writes share one transaction's atomicity + durability.
await db.transaction(async (tx) => {
  await tx.query(`INSERT INTO payments (...) VALUES (...)`);
  await tx.query(`INSERT INTO idempotency_keys (key, ...) VALUES ($1, ...)`, [key]);
});
```

## 8. Failure scenarios

- **Calling an external API (a payment provider) inside a transaction that later rolls back** — the external call's side effect already happened and is now orphaned relative to your now-rolled-back local state, a real, common source of "we charged the customer but have no local record of it" incidents.
- **Assuming Consistency (the "C") protects business logic correctness** — it only enforces declared constraints; a logically wrong but constraint-respecting transaction commits fine.
- **A long-running transaction left open** (a forgotten `COMMIT`/`ROLLBACK`, or a bug holding a transaction open across a slow external call) — directly connects to Lesson 7's vacuum content: an old open transaction prevents Postgres from cleaning up dead row versions other transactions have since created, causing bloat to accumulate specifically because of that one lingering transaction.

## 9. Common misconceptions

- **"Consistency in ACID is the same C as in CAP."** They are different, unrelated uses of the same letter — ACID's Consistency is about respecting declared constraints within a single database; CAP's Consistency (Level 7) is about whether distributed replicas agree with each other. Conflating them is a genuinely common, genuinely confusing mistake this curriculum flags explicitly to prevent later.
- **"A transaction protects against any bug in the code between BEGIN and COMMIT."** It protects against partial persistence and concurrent visibility — it does not protect against logically incorrect operations that are individually well-formed.
- **"Wrapping everything in one big transaction is always safer."** Longer-held transactions increase lock contention (Lesson 6) and vacuum-blocking (Lesson 7) — transaction scope is a real design decision, not "bigger is always more correct."

## 10. Trade-offs

Transactions cost real overhead (WAL writes, lock-holding, MVCC row-version bookkeeping) in exchange for atomicity/isolation/durability guarantees that are, for most stateful operations with real consequences (Project 2 especially), non-negotiable. The design decision isn't "use transactions or not" — it's "how much work belongs inside one transaction's boundary," balancing atomicity needs against lock/vacuum-pressure cost.

## 11. Real-world applications

- Every financial ledger operation (Project 2) needs atomicity across multiple row changes (debit one account, credit another) precisely as this lesson's example shows — a non-negotiable, direct application, not an abstraction.
- WAL-based durability is also the exact mechanism underlying Lesson 9's replication — a replica is, at its core, continuously replaying another server's WAL stream.

## 12. Connections

Directly grounds Module 2, Lessons 8–9 (idempotency and the transactional outbox — both patterns are applications of this lesson's atomicity+durability guarantees). Sets up Lesson 6 (isolation gets its own lesson because it's a spectrum) and Lesson 7 (MVCC is the mechanism making atomicity and isolation both work simultaneously).

## 13. Practical exercise

Write a transfer function (debit A, credit B) and deliberately trigger a failure partway through (e.g., a `CHECK` constraint violation on the credit if it would make a balance negative). Confirm, by querying afterward, that the debit did NOT persist either — atomicity, verified empirically rather than assumed.

## 14. Challenge

Design how Project 2 should handle a payment operation that must both write a local ledger entry (needs a transaction) and call an external payment provider (cannot be part of that transaction). Using this lesson's content on what transactions can't span, propose a concrete sequencing that avoids the "charged but no record" and "recorded but never charged" failure modes.

## 15. Mastery test

- Explain each ACID letter's guarantee precisely enough to state, for a given code snippet, which guarantee (if any) is being violated.
- Explain why ACID's Consistency and CAP's Consistency are different concepts, using a concrete example that satisfies one but not the other.
- Explain the mechanical reason WAL-based durability is faster than directly writing data pages before confirming a commit.
- Explain why a transaction cannot safely wrap an external, non-database side effect, and what class of problem this creates.
