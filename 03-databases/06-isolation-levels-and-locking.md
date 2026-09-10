# Isolation Levels & Locking — The Spectrum Between "Fast" and "Never Wrong"

## 1. Why does this exist?

Lesson 5 named Isolation as one of ACID's four guarantees, but treated it as a single property — it isn't. Isolation is a tunable spectrum, and "READ COMMITTED is the default" (Postgres's actual default) is a specific, deliberate point on that spectrum with real, known gaps that most developers have never had to reason about, because the gaps only surface under genuine concurrency, which local development rarely exercises.

## 2. Mental model

Full isolation (Serializable) behaves as if every transaction ran one at a time, in some order, even though they're actually running concurrently — the strongest, safest, most expensive guarantee. Weaker isolation levels trade away specific pieces of that illusion for speed, each one explicitly permitting a named category of "concurrent transactions can see into each other's business in a specific way" that the stronger levels forbid.

## 3. Technical explanation

**The three isolation levels Postgres actually implements distinctly (it accepts all four SQL-standard names, but READ UNCOMMITTED behaves identically to READ COMMITTED in Postgres, because its MVCC architecture never exposes uncommitted data to any level — a genuinely Postgres-specific detail worth knowing, since it differs from some other databases):**

- **Read Committed (Postgres's default)**: each individual *statement* within a transaction sees a fresh snapshot of the database as of when *that statement* began — not as of when the whole transaction began. This means two `SELECT`s in the same transaction, with a concurrent transaction committing in between them, can see **different** data — a **non-repeatable read**. This is the specific, real anomaly Read Committed explicitly permits in exchange for its comparatively low locking overhead.
- **Repeatable Read**: the entire transaction sees one snapshot, fixed as of the transaction's start — no non-repeatable reads, and (in Postgres specifically, which implements a *stronger* guarantee here than the SQL standard technically requires for this isolation level) no **phantom reads** either (a repeated query returning a different *set* of rows due to concurrent inserts/deletes). What Repeatable Read in Postgres does **not** prevent: **serialization anomalies** — situations where the *combination* of two concurrent transactions produces a result that couldn't have occurred under any serial (one-at-a-time) execution order, even though neither transaction individually saw stale data.
- **Serializable**: Postgres implements this via **Serializable Snapshot Isolation (SSI)**, which detects and aborts (with a serialization failure error your application must be prepared to retry) any transaction whose concurrent execution could produce a result inconsistent with *some* serial ordering — the "ideal" of true one-at-a-time execution, emulated without actually serializing everything, which would obviously destroy throughput. This is the only level immune to every anomaly, including serialization anomalies — at the real cost of transactions sometimes failing and needing an application-level retry loop, which is a genuine, non-optional part of using this isolation level correctly, not an edge case you can ignore.

**A concrete serialization anomaly, made specific, because "it's an edge case" undersells how real this is:** two concurrent transactions, each checking "is there currently a room booked for this slot" and, finding none, each independently booking it — under Read Committed *and* Repeatable Read, both transactions can each see zero existing bookings (because each is reading a snapshot from before the other's insert), and both successfully insert, producing a double-booking that neither transaction's own logic would have permitted if it had known about the other. This is exactly the anomaly Serializable exists to prevent, and exactly the kind of bug that never appears in single-user testing and appears only under genuine concurrent load — precisely why "READ COMMITTED prevents race conditions" (a flagged misconception from the roadmap) is false as a blanket statement.

**Locking — the other half of concurrency control, distinct from but interacting with isolation level:** MVCC (Lesson 7) handles *readers never blocking writers and writers never blocking readers* for ordinary reads, but writers can still block **other writers** contending for the same row — this is where explicit locking behavior matters. **Row-level locks** (acquired implicitly by `UPDATE`/`DELETE`, or explicitly via `SELECT ... FOR UPDATE`) block a second transaction from modifying the same row until the first commits or rolls back. **`SELECT ... FOR UPDATE`** is the standard, explicit way to say "I'm about to read this row in order to modify it, and I want to hold a lock on it now, not just at UPDATE time" — critical for correctly implementing a read-then-conditionally-write pattern (check a balance, then debit it) under concurrency, because without it, two concurrent transactions can both read the same "sufficient balance" state before either writes, and both proceed to debit — the exact same *shape* of anomaly as the double-booking example above, just caused by application logic racing rather than isolation-level snapshot timing.

**Deadlocks — what they are mechanically, and how Postgres actually resolves them:** a deadlock occurs when transaction A holds a lock transaction B is waiting for, while B simultaneously holds a lock A is waiting for — neither can proceed, and without intervention, both would wait forever. Postgres detects this via a **wait-for graph**: transactions are nodes, an edge means "waiting on a lock held by," and a **cycle** in that graph is a deadlock, by definition. Postgres periodically checks for cycles and, on finding one, **aborts one of the transactions** (chosen to break the cycle, typically the one that would be cheapest/most recent to abort) with a deadlock-detected error, letting the other proceed — this means your application code must be prepared to catch a deadlock error and retry, exactly like the Serializable-isolation retry requirement above; both are cases where the database protects correctness by making your application responsible for retrying a failed transaction, not by preventing the failure from ever happening.

**Deadlock *prevention* strategies, beyond detect-and-abort, worth knowing by name since they show up in different systems:** **timeout-based** (assume deadlock if a lock wait exceeds some threshold, abort and retry — simple, but can false-positive on genuinely slow-but-not-deadlocked contention); **wait-die / wound-wait** (schemes using transaction age/priority to decide who waits and who aborts, avoiding the need for cycle detection at all, common in some distributed-database designs — Level 7 revisits this territory for distributed deadlocks specifically). Postgres uses detect-and-abort via the wait-for graph as its primary mechanism.

## 5. How it works internally

`SELECT ... FOR UPDATE` acquires the row lock at the time of the `SELECT`, not at the time of a later `UPDATE` statement — this is precisely why it's the correct tool for "read this specific row with intent to modify it shortly," closing the race window a plain `SELECT` followed by a separate `UPDATE` leaves open under Read Committed's per-statement-snapshot behavior.

## 6. Example

```sql
-- Two concurrent sessions, under Read Committed, both running this:
BEGIN;
  SELECT balance FROM accounts WHERE id = 1; -- both see balance = 100
  -- (application logic decides 100 >= 50, proceeds to debit)
  UPDATE accounts SET balance = balance - 50 WHERE id = 1;
COMMIT;
-- Without FOR UPDATE, both transactions can pass the balance check
-- before either commits — a real overdraft bug under concurrency.
```

## 7. Code

```sql
BEGIN;
  SELECT balance FROM accounts WHERE id = 1 FOR UPDATE; -- locks the row NOW
  -- a concurrent transaction's own FOR UPDATE on the same row now BLOCKS
  -- here until this transaction commits or rolls back — the race window
  -- from the example above is closed.
  UPDATE accounts SET balance = balance - 50 WHERE id = 1 AND balance >= 50;
COMMIT;
```

## 8. Failure scenarios

- **A read-then-write balance check without `FOR UPDATE`**, exactly as shown above — a real, common source of race-condition overdraft/overselling bugs, and directly relevant to Project 2's core correctness requirement.
- **Choosing Serializable isolation without implementing retry logic** for the serialization-failure errors it can legitimately raise — the transactions aren't buggy, the application simply isn't honoring the contract this isolation level requires (catch-and-retry).
- **A deadlock cycle in production** between two code paths that acquire the same two rows' locks in opposite order (transaction A locks row 1 then row 2; transaction B locks row 2 then row 1) — a classic, well-known deadlock shape, avoidable by establishing and enforcing a consistent lock-acquisition order across your codebase.

## 9. Common misconceptions

- **"READ COMMITTED prevents race conditions."** It prevents seeing uncommitted data, but explicitly permits non-repeatable reads and, more importantly, the read-then-write race and serialization anomalies described above — a flagged, real misconception, not a nitpick.
- **"Serializable isolation eliminates the need to think about concurrency."** It shifts the burden from "reason carefully about every possible interleaving" to "reason about your retry logic for serialization failures" — a real trade, not a free pass.
- **"A deadlock means my code has a bug that must be eliminated."** Some level of deadlock possibility is often an accepted, retried-around cost of concurrent access to shared rows, not necessarily a design flaw — the actual fix is either consistent lock ordering (reducing frequency) or robust retry handling (tolerating occurrence), not necessarily "deadlocks must never happen."

## 10. Trade-offs

Read Committed: fastest, least locking overhead, permits the most anomalies. Repeatable Read: stronger snapshot guarantee, still permits serialization anomalies, moderate overhead. Serializable: strongest guarantee, requires application-level retry handling, real throughput cost under high contention. The right choice is workload-specific — a reporting query reading a consistent snapshot might want Repeatable Read; a financial transfer with correctness as the top priority might justify Serializable's retry cost; a low-stakes, high-throughput read path is often fine at the default.

## 11. Real-world applications

- Project 2's ledger/balance operations are the textbook case for either `SELECT ... FOR UPDATE` under Read Committed, or Serializable isolation with retry logic — this lesson's content is directly, immediately load-bearing for that project, not abstract theory.
- Inventory/seat-booking systems (the double-booking example) are one of the most commonly cited real-world illustrations of why isolation level choice is a genuine correctness decision, not a performance tuning knob only.

## 12. Connections

Directly extends Lesson 5 (isolation was named there as one ACID guarantee; this lesson unpacks it as the spectrum it actually is) and depends on Lesson 3's locking-adjacent index-maintenance content lightly. Sets up Lesson 7 (MVCC is the mechanism making Read Committed's per-statement snapshots and Repeatable Read's whole-transaction snapshot both possible).

## 13. Practical exercise

Reproduce the overdraft race condition from this lesson using two concurrent `psql` sessions manually (begin both transactions, interleave the statements by hand) under Read Committed without `FOR UPDATE`, and confirm both debits succeed even though the account shouldn't have had sufficient balance for both. Then repeat with `FOR UPDATE` and confirm the second session blocks.

## 14. Challenge

Design the isolation-level and locking strategy for Project 2's core transfer operation, and write the retry logic your application needs if you choose Serializable isolation — specify exactly what error you're catching and how many retry attempts with what backoff (previews Level 6).

## 15. Mastery test

- Explain the difference between a non-repeatable read and a phantom read, and which isolation levels permit each in Postgres specifically.
- Construct a concrete serialization anomaly (not the double-booking example verbatim) that Repeatable Read permits but Serializable prevents.
- Explain precisely why `SELECT ... FOR UPDATE` closes the read-then-write race that a plain `SELECT` followed by `UPDATE` leaves open.
- Explain how Postgres detects a deadlock mechanically, and what your application must do in response.
